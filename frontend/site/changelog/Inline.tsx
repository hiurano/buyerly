import { Fragment, type ReactNode } from 'react';

// An entry's inline markup: [links](url) and *emphasis*, the rest as text.
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const EMPHASIS = /\*([^*]+)\*/g;

function emphasis(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(EMPHASIS)) {
    out.push(text.slice(at, match.index));
    out.push(<em key={match.index}>{match[1]}</em>);
    at = match.index + match[0].length;
  }
  out.push(text.slice(at));
  return out.filter((part) => part !== '');
}

export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    out.push(<Fragment key={`t${at}`}>{emphasis(text.slice(at, match.index))}</Fragment>);
    out.push(<a key={match.index} href={match[2]}>{emphasis(match[1])}</a>);
    at = match.index + match[0].length;
  }
  out.push(<Fragment key={`t${at}`}>{emphasis(text.slice(at))}</Fragment>);
  return out;
}
