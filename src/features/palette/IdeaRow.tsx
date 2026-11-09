import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatRelative, standing, type InboxEntry } from "../../domain/inbox";
import { useMember } from "../auth/currentMemberContext";
import { personClass } from "./labels";
import { usePartners } from "./queries";

type IdeaRowProps = {
  entry: InboxEntry;
  now: Date;
  /** Drafts show a trailing Share button instead of a time. */
  trailing?: ReactNode;
  /** On Plan everything is agreed, so "Both in" would only repeat itself. */
  hideAgreed?: boolean;
};

/**
 * One inbox row, one job per line: the title; what happened last; then where each of us stands,
 * them on one line and me on the next, each as a block in that person's color. A row that needs me
 * is pinned, gets the rose edge and shows the "Your turn" pill. Unread (bold, dot) is separate.
 */
export function IdeaRow({ entry, now, trailing, hideAgreed = false }: IdeaRowProps) {
  const member = useMember();
  const partners = usePartners().data ?? [];
  const where = standing(entry, member.id);
  const { item, stage, yourTurn, unread, activity } = entry;
  const location = useLocation();
  // Opening keeps the list's view (e.g. ?view=drafts) so the list behind the sheet doesn't change.
  const search = location.pathname === "/ideas" ? location.search : "";
  const classes = [
    "idea-row",
    yourTurn ? "is-your-turn" : "",
    unread ? "is-unread" : "",
    stage === "draft" ? "is-draft" : "",
    stage === "not_now" ? "is-not-now" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={classes}>
      <Link to={{ pathname: `/ideas/${item.id}`, search }} state={{ fromList: true }} className="idea-row-link">
        <span className="idea-row-body">
          <span className="idea-row-top">
            <span className="idea-row-title">{item.title}</span>
            {trailing ? null : (
              <time className="idea-row-time" dateTime={activity.at}>
                {formatRelative(activity.at, now)}
              </time>
            )}
          </span>
          <span className="idea-row-line">{activity.line}</span>
          {where.kind === "both" ? (
            <span className="idea-row-standing" role="list">
              {where.people.map((person) => (
                <span
                  key={person.mine ? "me" : "them"}
                  role="listitem"
                  className={`standing-person ${personClass(person.memberId, partners)}${person.mine ? " is-mine" : ""}`}
                >
                  {/* Each person keeps one color everywhere; the fill shows the answer. Text says it too. */}
                  <span className={`person-mark is-${person.state}`} aria-hidden="true" />
                  <span className="standing-text">
                    <span className={person.turn ? "standing-turn" : "standing-answer"}>{person.answer}</span>
                  {person.rating ? (
                    <>
                      {" · "}
                      <span className="row-interest">{person.rating}</span>
                    </>
                  ) : null}
                  {person.favorite ? (
                    <>
                      {" · "}
                      <span aria-hidden="true">♥</span>
                      <span className="visually-hidden"> favorite</span>
                    </>
                  ) : null}
                  </span>
                </span>
              ))}
            </span>
          ) : where.kind === "agreed" && !hideAgreed ? (
            <span className="idea-row-standing">Both in</span>
          ) : null}
        </span>
        {unread ? (
          <span className="unread-dot">
            <span className="visually-hidden">, Unread</span>
          </span>
        ) : null}
      </Link>
      {trailing ? <span className="idea-row-trailing">{trailing}</span> : null}
    </li>
  );
}
