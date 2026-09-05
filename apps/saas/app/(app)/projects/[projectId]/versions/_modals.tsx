"use client";

import { useEffect, useMemo, useState } from "react";
import { INTEGRATION_BRANCH, PROD_BRANCH } from "@swimlane-cloud/github-client";
import { ChangeBrowser, Empty, Modal, ModalFooter, describeError } from "../_components";
import { normalizeVersionName, nextVersionName } from "@/lib/version-name";
import { compare, publishRelease } from "@/lib/workflow";
import type { CompareResponse } from "@/lib/types";
import { useT } from "@/i18n";

/**
 * 公開する / Publish: snapshot 承認済み (preview), tag it with a version
 * number and land it on 公開済み (main), in one request. Prefills the next
 * version number from what has already shipped and shows every file that
 * will change before confirming.
 */
export function PublishModal({
  projectId,
  existingNames,
  onClose,
  onPublished,
}: {
  projectId: string;
  existingNames: string[];
  onClose: () => void;
  onPublished: (result: { versionId: string; tag: string; renderFailures: string[] }) => void;
}) {
  const { t } = useT();
  const [cmp, setCmp] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggested = useMemo(() => nextVersionName(existingNames), [existingNames]);
  const [name, setName] = useState(suggested);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    compare(projectId, PROD_BRANCH, INTEGRATION_BRANCH)
      .then((r) => {
        if (!cancelled) setCmp(r);
      })
      .catch((e) => {
        if (!cancelled) setError(describeError(e, t));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const normalized = normalizeVersionName(name);
  const noChanges = cmp?.status === "identical";

  async function handlePublish() {
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      const res = await publishRelease(projectId, normalized, note.trim() || undefined);
      onPublished(res);
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("versions.publish.title")}
      onClose={onClose}
      maxW="max-w-4xl"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => void handlePublish()}
          confirmLabel={t("versions.publish")}
          disabled={!normalized || noChanges || !cmp}
          busy={busy}
        />
      }
    >
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              {t("versions.publish.version")}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-sm"
            />
            {!normalized && name.trim() !== "" && (
              <p className="mt-1 text-xs text-red-600">{t("versions.publish.invalid")}</p>
            )}
          </div>
          <div className="flex-[2]">
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              {t("versions.publish.note")}
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        {noChanges ? (
          <Empty>{t("versions.publish.noChanges")}</Empty>
        ) : cmp ? (
          <ChangeBrowser
            projectId={projectId}
            headRef={INTEGRATION_BRANCH}
            baseRef={PROD_BRANCH}
            preloaded={cmp.files}
          />
        ) : (
          <Empty>{t("loading")}</Empty>
        )}
      </div>
    </Modal>
  );
}

/** Confirms publishing a specific, already-flagged (legacy) version to main. */
export function PromoteModal({
  name,
  onClose,
  onConfirm,
  busy,
}: {
  name: string;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const { t } = useT();
  return (
    <Modal
      title={t("version.promoteTo")}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={onConfirm}
          confirmLabel={t("version.promoteTo")}
          busy={busy}
        />
      }
    >
      <p className="text-sm text-neutral-600">{t("versions.promoteConfirm", { name })}</p>
    </Modal>
  );
}
