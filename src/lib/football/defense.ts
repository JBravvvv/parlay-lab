/** Defense markets describe a club, never an individual athlete. */
export function defenseClub(name:string|null|undefined):string|null {
 const s=(name??"").trim();
 const m=/^(.+?)\s+(?:D\s*\/\s*ST|DST|DEF|Defen[cs]e(?:\s*(?:&|and|\/)\s*Special Teams)?|Defense\/Special Teams)$/i.exec(s);
 return m?.[1]?.trim()||null;
}
export function canonicalFootballPlayer(name:string):string {
 const club=defenseClub(name);return club?`${club} D/ST`:name;
}
