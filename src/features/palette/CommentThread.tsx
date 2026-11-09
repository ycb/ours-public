import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { charLength } from "../../domain/model";
import { useSupabase } from "../../lib/supabaseContext";
import { addComment, type Comment, type PartnerSummary } from "./api";
import { activityKeys, paletteKeys } from "./keys";
import { formatDate, personClass } from "./labels";
import { useComments } from "./queries";

export const COMMENT_LIMIT = 2000;
const newRequestId = () => crypto.randomUUID();

type CommentThreadProps = { itemId: string; partners: PartnerSummary[]; currentMemberId: string };

/** Flat, append-only, chronological. */
export function CommentThread({ itemId, partners, currentMemberId }: CommentThreadProps) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const comments = useComments(itemId);
  const [body, setBody] = useState("");
  // Kept across retries until the server confirms, so an ambiguous failure can't duplicate.
  const [requestId, setRequestId] = useState(newRequestId);
  const [problem, setProblem] = useState<string | null>(null);
  const ids = { composer: useId(), error: useId() };
  const partnerName = partners.find((partner) => partner.id !== currentMemberId)?.display_name ?? "your partner";

  const nameOf = (memberId: string) =>
    memberId === currentMemberId ? "You" : (partners.find((partner) => partner.id === memberId)?.display_name ?? "Partner");

  const post = useMutation({
    mutationFn: () => addComment(client, { requestId, itemId, body }),
    onSuccess: async (saved) => {
      queryClient.setQueryData<Comment[]>(paletteKeys.comments(itemId), (current = []) =>
        current.some((existing) => existing.id === saved.id) ? current : [...current, saved],
      );
      setBody("");
      setRequestId(newRequestId());
      setProblem(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paletteKeys.comments(itemId) }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }),
      ]);
    },
    onError: () => setProblem("Not sent. Your words are still here — check your connection and try again."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (post.isPending) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    if (charLength(trimmed) > COMMENT_LIMIT) {
      return setProblem(`Keep messages to ${COMMENT_LIMIT} characters or fewer.`);
    }
    setProblem(null);
    post.mutate();
  }

  return (
    <section className="detail-section chat-section" aria-label="Chat">
      {comments.isPending ? (
        <p role="status" className="loading-state">
          Loading messages…
        </p>
      ) : comments.isError ? (
        <p className="field-error">
          Messages couldn&apos;t load.{" "}
          <button type="button" className="link-button" onClick={() => void comments.refetch()}>
            Try again
          </button>
        </p>
      ) : comments.data.length === 0 ? null : (
        <ul className="comment-list" aria-label="Messages">
          {comments.data.map((comment) => (
            <li key={comment.id} className={comment.kind === "not_now_reason" ? "comment is-reason" : "comment"}>
              <p className="comment-meta">
                <span className={`partner-name ${personClass(comment.author_member_id, partners)}`}>
                  {nameOf(comment.author_member_id)}
                </span> · {formatDate(comment.created_at)}
                {comment.kind === "not_now_reason" ? <span className="reason-tag"> · Later</span> : null}
              </p>
              <p className="comment-body">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form className="comment-composer" onSubmit={handleSubmit} noValidate>
        <textarea
          id={ids.composer}
          aria-label={`Message to ${partnerName}`}
          placeholder={`Write to ${partnerName}…`}
          rows={2}
          value={body}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? ids.error : undefined}
          onChange={(event) => setBody(event.target.value)}
        />
        {problem ? (
          <p id={ids.error} role="alert" className="field-error">
            {problem}
          </p>
        ) : null}
        <div className="form-actions">
          {/* Send appears ready only with something to send, so it never reads as "submit my answer". */}
          <button type="submit" className="button-primary" disabled={post.isPending || !body.trim()}>
            {post.isPending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
