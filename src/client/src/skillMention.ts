export interface ActiveSkillMention {
  start: number;
  end: number;
  query: string;
}

export function findActiveSkillMention(input: string, cursor: number): ActiveSkillMention | null {
  const prefix = input.slice(0, cursor);
  const match = prefix.match(/(?:^|\s)@([a-z0-9:-]*)$/i);
  if (!match) return null;
  const rawToken = match[1].toLowerCase();
  if (rawToken && !'skill:'.startsWith(rawToken) && !rawToken.startsWith('skill:')) return null;
  return {
    start: prefix.lastIndexOf('@'),
    end: cursor,
    query: rawToken.startsWith('skill:') ? rawToken.slice('skill:'.length) : '',
  };
}
