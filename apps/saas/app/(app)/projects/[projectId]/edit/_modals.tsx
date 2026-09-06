"use client";

import { useCallback, useEffect, useState } from "react";
import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import {
  ChangeBrowser,
  ChangeList,
  Empty,
  Modal,
  ModalFooter,
  describeError,
} from "../_components";
import { autoSubject } from "@/lib/commit-message";
import { checkpoint, compare, listPendingChanges, openPR } from "@/lib/workflow";
import type { CompareResponse, PendingChange } from "@/lib/types";
import { useT } from "@/i18n";

/** Push everything uncommitted on `branch` to GitHub as one commit. */
export function PushModal({
  projectId,
  branch,
  headSha,
  onClose,
  onPushed,
}: {
  projectId: string;
  branch: string;
  headSha?: string;
  onClose: () => void;
  onPushed: (result: { commitSha: string }) => void;
}) {
  const { t } = useT();
  const [changes, setChanges] = useState<PendingChange[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPendingChanges(projectId, branch)
      .then((r) => {
        if (!cancelled) setChanges(r.changes);
      })
      .catch((e) => {
        if (!cancelled) setError(describeError(e, t));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, branch]);

  async function handlePush() {
    setBusy(true);
    setError(null);
    try {
      const res = await checkpoint(
        projectId,
        branch,
        message.trim() || undefined,
        undefined,
        headSha,
      );
      onPushed({ commitSha: res.commitSha });
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  const nothingToPush = changes !== null && changes.length === 0;

  return (
    <Modal
      title={t("edit.push.title")}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => void handlePush()}
          confirmLabel={t("edit.push")}
          disabled={!changes || nothingToPush}
          busy={busy}
        />
      }
    >
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            {t("edit.push.message")}
          </label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={changes && changes.length ? autoSubject(changes) : ""}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-neutral-600">{t("edit.push.files")}</p>
          {changes === null ? <Empty>{t("loading")}</Empty> : <ChangeList changes={changes} />}
        </div>
        {nothingToPush && <p className="text-xs text-neutral-500">{t("edit.push.nothing")}</p>}
      </div>
    </Modal>
  );
}

/**
 * Open a pull request from `branch` into preview. Refuses to proceed while
 * anything is still unpushed — offering "Push first" instead of silently
 * committing on the user's behalf — and shows every file that will change.
 */
export function RequestReviewModal({
  projectId,
  branch,
  onClose,
  onRequested,
}: {
  projectId: string;
  branch: string;
  onClose: () => void;
  onRequested: (result: { number: number }) => void;
}) {
  const { t } = useT();
  const [pending, setPending] = useState<PendingChange[] | null>(null);
  const [cmp, setCmp] = useState<CompareResponse | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPush, setShowPush] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        listPendingChanges(projectId, branch),
        compare(projectId, INTEGRATION_BRANCH, branch),
      ]);
      setPending(p.changes);
      setCmp(c);
    } catch (e) {
      setError(describeError(e, t));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, branch]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasUnpushed = (pending?.length ?? 0) > 0;
  const noChanges = Boolean(cmp) && cmp!.status === "identical" && !hasUnpushed;

  async function handleRequest() {
    setBusy(true);
    setError(null);
    try {
      const res = await openPR(projectId, branch, title.trim() || undefined);
      onRequested({ number: res.number });
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        title={t("edit.review.title")}
        onClose={onClose}
        maxW="max-w-4xl"
        footer={
          <ModalFooter
            onCancel={onClose}
            onConfirm={() => void handleRequest()}
            confirmLabel={t("edit.requestReview")}
            disabled={hasUnpushed || noChanges || !cmp}
            busy={busy}
          />
        }
      >
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {hasUnpushed && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span>{t("edit.review.unpushed")}</span>
              <button
                onClick={() => setShowPush(true)}
                className="shrink-0 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
              >
                {t("edit.review.pushFirst")}
              </button>
            </div>
          )}
          {!hasUnpushed && noChanges && <Empty>{t("edit.review.noChanges")}</Empty>}
          {!hasUnpushed && !noChanges && cmp && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  {t("edit.review.titleField")}
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("edit.review.titleDefault", { n: String(cmp.files.length) })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </div>
              <ChangeBrowser
                projectId={projectId}
                headRef={branch}
                baseRef={INTEGRATION_BRANCH}
                preloaded={cmp.files}
              />
            </>
          )}
        </div>
      </Modal>
      {showPush && (
        <PushModal
          projectId={projectId}
          branch={branch}
          onClose={() => setShowPush(false)}
          onPushed={() => {
            setShowPush(false);
            void load();
          }}
        />
      )}
    </>
  );
}

/** Confirms abandoning the current edit branch and every uncommitted change on it. */
export function DiscardEditModal({
  onConfirm,
  onClose,
  busy,
}: {
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const { t } = useT();
  return (
    <Modal
      title={t("edit.discard")}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={onConfirm}
          confirmLabel={t("edit.discard")}
          busy={busy}
          danger
        />
      }
    >
      <p className="text-sm text-neutral-600">{t("edit.discard.confirm")}</p>
    </Modal>
  );
}
