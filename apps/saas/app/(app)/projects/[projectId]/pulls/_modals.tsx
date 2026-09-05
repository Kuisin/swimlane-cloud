"use client";

import { useEffect, useState } from "react";
import { branchLabel } from "@/lib/branch-label";
import { ChangeBrowser, Empty, Modal, ModalFooter, describeError } from "../_components";
import { closePR, getPR, mergePR } from "@/lib/workflow";
import type { CompareFile, PullState } from "@/lib/types";
import { useT } from "@/i18n";

/** Shows every file the request will change, then merges it into its base branch. */
export function ApproveModal({
  projectId,
  pr,
  onClose,
  onApproved,
}: {
  projectId: string;
  pr: PullState;
  onClose: () => void;
  onApproved: () => void;
}) {
  const { t } = useT();
  const [files, setFiles] = useState<CompareFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPR(projectId, pr.number)
      .then((d) => {
        if (!cancelled) setFiles(d.files);
      })
      .catch((e) => {
        if (!cancelled) setError(describeError(e, t));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pr.number]);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      await mergePR(projectId, pr.number, pr.headSha || undefined);
      onApproved();
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("pulls.approve.title", { base: branchLabel(pr.base, t) })}
      onClose={onClose}
      maxW="max-w-4xl"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => void handleApprove()}
          confirmLabel={t("pr.approve", { base: branchLabel(pr.base, t) })}
          disabled={!files}
          busy={busy}
        />
      }
    >
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-neutral-500">{t("pulls.approve.hint")}</p>
        {files === null ? (
          <Empty>{t("loading")}</Empty>
        ) : (
          <ChangeBrowser
            projectId={projectId}
            headRef={pr.state === "open" ? pr.head : pr.headSha || pr.head}
            baseRef={pr.state === "open" ? pr.base : pr.baseSha || pr.base}
            preloaded={files}
          />
        )}
      </div>
    </Modal>
  );
}

/** Closes the request without applying any of its changes. */
export function RejectModal({
  projectId,
  pr,
  onClose,
  onRejected,
}: {
  projectId: string;
  pr: PullState;
  onClose: () => void;
  onRejected: () => void;
}) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      await closePR(projectId, pr.number);
      onRejected();
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("pr.reject")}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => void handleReject()}
          confirmLabel={t("pr.reject")}
          busy={busy}
          danger
        />
      }
    >
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <p className="text-sm text-neutral-600">{t("pulls.reject.confirm")}</p>
    </Modal>
  );
}
