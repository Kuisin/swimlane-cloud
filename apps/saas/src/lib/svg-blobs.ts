/**
 * SVG blob resolution (plan §"SVG — only on new version flag").
 *
 * Called ONLY from the flag-new-version flow. Renders canonical SVG with the
 * shared engine, deduplicates by sha256 of the DSL text, uploads new blobs to
 * S3, and records a `svg_blobs` row. Returns the blob id.
 */
import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
// The engine is a workspace package that runs in Node for server-side render.
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { ApiError } from "./api";
import { getServiceSupabase } from "./supabase/server";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function getS3(): { client: S3Client; bucket: string } {
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_SVG_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new ApiError(
      500,
      "S3 is not configured (AWS_REGION / S3_SVG_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).",
    );
  }
  return {
    client: new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

export interface ResolveSvgResult {
  blobId: string;
  hash: string;
  storagePath: string;
  reused: boolean;
}

/**
 * Render `dslText` to SVG, dedup against svg_blobs.dsl_content_hash; on miss,
 * upload the SVG to S3 and insert a row. Returns the blob id.
 */
export async function resolveSvgBlob({
  dslText,
  themeKey = "basic",
}: {
  dslText: string;
  themeKey?: string;
}): Promise<ResolveSvgResult> {
  const hash = sha256(dslText);
  const supabase = getServiceSupabase();

  // Dedup: reuse an existing blob for identical DSL content.
  const { data: existing, error: selErr } = await supabase
    .from("svg_blobs")
    .select("id, svg_storage_path")
    .eq("dsl_content_hash", hash)
    .maybeSingle();
  if (selErr) throw new ApiError(500, `svg_blobs lookup failed: ${selErr.message}`);
  if (existing) {
    return {
      blobId: existing.id as string,
      hash,
      storagePath: existing.svg_storage_path as string,
      reused: true,
    };
  }

  // Render canonical SVG server-side.
  const { svg, errors } = textToSvg(dslText, { themeKey });
  if (!svg) {
    const first = errors?.[0]?.msg ?? "unknown render error";
    throw new ApiError(422, `Could not render SVG: ${first}`);
  }

  // Upload to S3 under a content-addressed key.
  const storagePath = `svg/${hash}.svg`;
  const { client, bucket } = getS3();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      Body: svg,
      ContentType: "image/svg+xml",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  // Insert row (handle race: another request may have inserted the same hash).
  const { data: inserted, error: insErr } = await supabase
    .from("svg_blobs")
    .insert({
      dsl_content_hash: hash,
      svg_storage_path: storagePath,
      theme_key: themeKey,
    })
    .select("id")
    .single();

  if (insErr) {
    // Unique violation → fetch the winner.
    const { data: raced } = await supabase
      .from("svg_blobs")
      .select("id, svg_storage_path")
      .eq("dsl_content_hash", hash)
      .single();
    if (raced) {
      return {
        blobId: raced.id as string,
        hash,
        storagePath: raced.svg_storage_path as string,
        reused: true,
      };
    }
    throw new ApiError(500, `svg_blobs insert failed: ${insErr.message}`);
  }

  return { blobId: inserted.id as string, hash, storagePath, reused: false };
}

/** Public URL for a stored SVG (virtual-hosted-style S3 URL). */
export function svgPublicUrl(storagePath: string): string {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const bucket = process.env.S3_SVG_BUCKET ?? "";
  return `https://${bucket}.s3.${region}.amazonaws.com/${storagePath}`;
}
