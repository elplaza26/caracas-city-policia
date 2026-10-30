export function parseApplicationIdentity(fullName: unknown, answers: any = {}) {
 const raw=String(answers.character_info||answers.personal||fullName||'').trim();
 const age=(value: unknown)=>/^\d{1,3}$/.test(String(value??'').trim())&&Number(value)>=1&&Number(value)<=120?Number(value):null;
 const ooc=raw.match(/\b(?:edad\s*)?(?:ooc|occ|oc)\s*[:=\-]?\s*(\d{1,3})\b/i)||raw.match(/\b(\d{1,3})\s*(?:años?\s*)?(?:ooc|occ|oc)\b/i);
 const ic=raw.match(/\bedad\s*(?:ic\s*)?[:=\-]?\s*(\d{1,3})\b/i)||raw.match(/\bic\s*[:=\-]\s*(\d{1,3})\b/i)||raw.match(/\b(\d{1,3})\s*(?:años?\s*)?ic\b/i);
 let ageIc=age(answers.age_ic)??age(ic?.[1]),ageOoc=age(answers.age_ooc)??age(ooc?.[1]);
 const first=raw.split(/\r?\n|\|/)[0].replace(/^nombre\s*(?:ic)?\s*[:=\-]\s*/i,'').trim();
 const hasAgeHint=/\bedad\b|\baños?\b|\b(?:ooc|occ|oc)\b|\b\d{1,3}\s+ic\b/i.test(raw);
 const numbers=[...raw.matchAll(/\b(\d{1,3})\b/g)];
 if(ageIc===null&&numbers.length&&hasAgeHint){
  const candidate=numbers.find(match=>!ooc||match.index!==(ooc.index??0)+ooc[0].indexOf(ooc[1]));
  ageIc=age(candidate?.[1]);
 }
 const parts=raw.split(/\||\r?\n/).map(s=>s.trim());
 if(parts.length>=3&&age(parts[1])!==null&&age(parts[2])!==null){ageIc??=age(parts[1]);ageOoc??=age(parts[2]);}
 const boundary=hasAgeHint?first.search(/\b\d{1,3}\b|\bedad\b|\baños?\b|\b(?:ooc|occ|oc)\b/i):-1;
 const name=(boundary>=0?first.slice(0,boundary):first).replace(/[\s,;:\-]+$/,'').trim();
 return {name:name||String(fullName||'').split(/\r?\n|\|/)[0].trim(),ageIc,ageOoc};
}
