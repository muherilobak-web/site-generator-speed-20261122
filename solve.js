// makefun-site 1.0.0 — drop-in static site generator (fast rewrite).
// Written from the brief only. ES module, no dependencies.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COMBINING = /\p{M}/gu;

function isWS(c) {
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13 || c === 160 || c === 133 || c === 0x2028 || c === 0x2029;
}

function esc(s) {
  if (s.indexOf('&') < 0 && s.indexOf('<') < 0 && s.indexOf('>') < 0 && s.indexOf('"') < 0 && s.indexOf("'") < 0) return s;
  let out = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let r = null;
    if (c === 38) r = '&amp;';
    else if (c === 60) r = '&lt;';
    else if (c === 62) r = '&gt;';
    else if (c === 34) r = '&quot;';
    else if (c === 39) r = '&#39;';
    if (r !== null) { out += s.slice(start, i) + r; start = i + 1; }
  }
  return start === 0 ? s : out + s.slice(start);
}

function trimST(s) {
  const L = s.length;
  if (L === 0) return s;
  const c0 = s.charCodeAt(0), c1 = s.charCodeAt(L - 1);
  if (c0 !== 32 && c0 !== 9 && c1 !== 32 && c1 !== 9) return s;
  let a = 0, b = L;
  while (a < b && (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9)) a++;
  while (b > a && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) b--;
  return s.slice(a, b);
}

function trimRightST(s) {
  let b = s.length;
  while (b > 0 && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) b--;
  return s.slice(0, b);
}

function isBlankST(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

let SLUG_MEMO = null;

function slugify(text) {
  if (SLUG_MEMO) {
    const hit = SLUG_MEMO.get(text);
    if (hit !== undefined) return hit;
  }
  let norm = text;
  let ascii = true;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 128) { ascii = false; break; }
  }
  if (!ascii) norm = text.normalize('NFKD').replace(COMBINING, '');
  let out = '', sep = false;
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i);
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      if (sep && out.length > 0) out += '-';
      out += norm[i];
      sep = false;
    } else if (c >= 65 && c <= 90) {
      if (sep && out.length > 0) out += '-';
      out += String.fromCharCode(c + 32);
      sep = false;
    } else {
      sep = true;
    }
  }
  if (out.length > 64) out = out.slice(0, 64);
  let e = out.length;
  while (e > 0 && out.charCodeAt(e - 1) === 45) e--;
  out = out.slice(0, e);
  const res = out === '' ? 'untitled' : out;
  if (SLUG_MEMO) SLUG_MEMO.set(text, res);
  return res;
}

function dateLong(d) {
  const m = (d.charCodeAt(5) - 48) * 10 + (d.charCodeAt(6) - 48);
  const day = (d.charCodeAt(8) - 48) * 10 + (d.charCodeAt(9) - 48);
  return day + ' ' + MONTHS[m - 1] + ' ' + d.slice(0, 4);
}

function wordCount(s) {
  let n = 0, inW = false;
  for (let i = 0; i < s.length; i++) {
    if (isWS(s.charCodeAt(i))) inW = false;
    else if (!inW) { inW = true; n++; }
  }
  return n;
}

function stripTrailingSlashes(s) {
  let e = s.length;
  while (e > 0 && s.charCodeAt(e - 1) === 47) e--;
  return s.slice(0, e);
}

// ---- Front matter ----
const FM_KEYS = { title: 1, date: 1, tags: 1, draft: 1, layout: 1, slug: 1, summary: 1 };

function parseKeyLine(line) {
  const L = line.length;
  let i = 0;
  while (i < L) {
    const c = line.charCodeAt(i);
    if ((c >= 97 && c <= 122) || c === 95) i++;
    else break;
  }
  if (i === 0) return null;
  if (i >= L || line.charCodeAt(i) !== 58) return null;
  const key = line.slice(0, i);
  i++;
  if (i === L) return { key, value: '' };
  if (line.charCodeAt(i) !== 32) return null;
  return { key, value: line.slice(i + 1) };
}

function parseQuoted(val) {
  const L = val.length;
  if (L < 2 || val.charCodeAt(L - 1) !== 34) return { err: 'a quoted string is not closed' };
  let out = '';
  for (let i = 1; i < L - 1; i++) {
    const c = val.charCodeAt(i);
    if (c === 92) {
      if (i === L - 2) return { err: 'a quoted string holds an escape other than \\" or \\\\' };
      const n = val.charCodeAt(i + 1);
      if (n !== 34 && n !== 92) return { err: 'a quoted string holds an escape other than \\" or \\\\' };
      out += val[i + 1];
      i++;
    } else if (c === 34) {
      return { err: 'a quoted string holds a stray quote' };
    } else {
      out += val[i];
    }
  }
  return { val: out };
}

function parseStringVal(val) {
  if (val.charCodeAt(0) === 34) return parseQuoted(val);
  if (val.charCodeAt(0) === 91) return { err: 'a bare string opens on [' };
  return { val };
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function validDateStr(v) {
  if (v.length !== 10 || v.charCodeAt(4) !== 45 || v.charCodeAt(7) !== 45) return false;
  for (let i = 0; i < 10; i++) {
    if (i === 4 || i === 7) continue;
    const c = v.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  const y = (v.charCodeAt(0) - 48) * 1000 + (v.charCodeAt(1) - 48) * 100 + (v.charCodeAt(2) - 48) * 10 + (v.charCodeAt(3) - 48);
  const m = (v.charCodeAt(5) - 48) * 10 + (v.charCodeAt(6) - 48);
  const d = (v.charCodeAt(8) - 48) * 10 + (v.charCodeAt(9) - 48);
  if (y < 1970 || y > 2099 || m < 1 || m > 12 || d < 1) return false;
  const dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

function validSlugStr(v) {
  if (v.length === 0 || v.length > 64) return false;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    const ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45;
    if (!ok) return false;
  }
  if (v.charCodeAt(0) === 45 || v.charCodeAt(v.length - 1) === 45) return false;
  for (let i = 1; i < v.length; i++) {
    if (v.charCodeAt(i) === 45 && v.charCodeAt(i - 1) === 45) return false;
  }
  return true;
}

function validateFMValue(key, val) {
  if (key === 'title' || key === 'summary') return parseStringVal(val);
  if (key === 'date') {
    if (!validDateStr(val)) return { err: 'not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
    return { val };
  }
  if (key === 'tags') {
    if (val.length < 2 || val.charCodeAt(0) !== 91 || val.charCodeAt(val.length - 1) !== 93) {
      return { err: 'not a list [a, b]' };
    }
    const inner = val.slice(1, -1);
    if (trimST(inner) === '') return { val: [] };
    const parts = inner.split(',');
    const out = [];
    for (let p = 0; p < parts.length; p++) {
      const name = trimST(parts[p]);
      if (name === '' || name.indexOf('"') >= 0 || name.indexOf('[') >= 0 || name.indexOf(']') >= 0) {
        return { err: 'an empty tag, or one holding " [ or ]' };
      }
      out.push(name);
    }
    return { val: out };
  }
  if (key === 'draft') {
    if (val === 'true') return { val: true };
    if (val === 'false') return { val: false };
    return { err: 'true or false' };
  }
  if (key === 'layout') {
    for (let i = 0; i < val.length; i++) {
      const c = val.charCodeAt(i);
      if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) return { err: 'not a template name' };
    }
    return { val };
  }
  if (key === 'slug') {
    if (!validSlugStr(val)) return { err: 'not a slug' };
    return { val };
  }
  return { val };
}

function parseFrontMatter(content) {
  // Pass 1: find the closing '---' line first (a missing close wins over
  // malformed lines). Pass 2: validate the lines in between.
  const firstNL = content.indexOf('\n');
  const firstLine = firstNL < 0 ? content : content.slice(0, firstNL);
  if (firstLine !== '---') return { ok: false, reason: 'no front matter' };
  const L = content.length;
  let pos = firstNL < 0 ? L : firstNL + 1;
  let closeStart = -1;
  let closeEnd = -1;
  while (pos < L) {
    if (content.charCodeAt(pos) === 45 && content.charCodeAt(pos + 1) === 45 && content.charCodeAt(pos + 2) === 45 &&
        (pos + 3 === L || content.charCodeAt(pos + 3) === 10)) {
      closeStart = pos;
      closeEnd = pos + 3 === L ? L : pos + 4;
      break;
    }
    const nl = content.indexOf('\n', pos);
    if (nl < 0) break;
    pos = nl + 1;
  }
  if (closeStart < 0) return { ok: false, reason: 'the front matter is not closed' };
  const fm = {};
  const seen = Object.create(null);
  pos = firstNL < 0 ? L : firstNL + 1;
  let lineNo = 1;
  while (pos < closeStart) {
    const nl = content.indexOf('\n', pos);
    const lineEnd = nl < 0 || nl > closeStart ? closeStart : nl;
    const line = content.slice(pos, lineEnd);
    lineNo++;
    pos = lineEnd + 1;
    if (isBlankST(line)) continue;
    if (line.charCodeAt(0) === 35) continue;
    const kv = parseKeyLine(line);
    if (!kv) return { ok: false, reason: 'line ' + lineNo + ' is not "key: value"' };
    const key = kv.key;
    if (!FM_KEYS[key]) return { ok: false, reason: 'unknown key "' + key + '"' };
    if (seen[key]) return { ok: false, reason: 'key "' + key + '" is given twice' };
    seen[key] = 1;
    const val = trimRightST(kv.value);
    if (val === '') return { ok: false, reason: 'key "' + key + '" has no value' };
    const r = validateFMValue(key, val);
    if (r.err) return { ok: false, reason: 'key "' + key + '": ' + r.err };
    fm[key] = r.val;
  }
  if (!('title' in fm)) return { ok: false, reason: 'no title' };
  return { ok: true, fm, body: content.slice(closeEnd) };
}

// ---- Markdown: blocks ----
function isLangChar(c) {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45;
}

function fenceOpenLang(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return null;
  const L = line.length;
  let j = 3;
  while (j < L && isLangChar(line.charCodeAt(j))) j++;
  const lang = line.slice(3, j);
  while (j < L && (line.charCodeAt(j) === 32 || line.charCodeAt(j) === 9)) j++;
  if (j !== L) return null;
  return lang;
}

function isFenceClose(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return false;
  for (let j = 3; j < line.length; j++) {
    const c = line.charCodeAt(j);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function isHR(line) {
  let e = line.length;
  while (e > 0 && (line.charCodeAt(e - 1) === 32 || line.charCodeAt(e - 1) === 9)) e--;
  if (e !== 3) return false;
  const c = line.charCodeAt(0);
  return (c === 45 && line.charCodeAt(1) === 45 && line.charCodeAt(2) === 45) ||
    (c === 42 && line.charCodeAt(1) === 42 && line.charCodeAt(2) === 42);
}

function matchHeading(line) {
  let h = 0;
  while (h < line.length && line.charCodeAt(h) === 35) h++;
  if (h === 0 || h > 6) return null;
  let j = h;
  if (j >= line.length || (line.charCodeAt(j) !== 32 && line.charCodeAt(j) !== 9)) return null;
  while (j < line.length && (line.charCodeAt(j) === 32 || line.charCodeAt(j) === 9)) j++;
  const text = trimRightST(line.slice(j));
  if (text === '') return null;
  return { level: h, text };
}

function matchListStart(line) {
  const c0 = line.charCodeAt(0);
  if ((c0 === 45 || c0 === 42) && line.length > 1 && line.charCodeAt(1) === 32) {
    return { ordered: false, num: 0, text: trimST(line.slice(2)) };
  }
  if (c0 >= 48 && c0 <= 57) {
    let j = 0;
    while (j < line.length && line.charCodeAt(j) >= 48 && line.charCodeAt(j) <= 57) j++;
    if (j >= 1 && j <= 9 && j + 1 < line.length && line.charCodeAt(j) === 46 && line.charCodeAt(j + 1) === 32) {
      let num = 0;
      for (let k = 0; k < j; k++) num = num * 10 + (line.charCodeAt(k) - 48);
      return { ordered: true, num, text: trimST(line.slice(j + 2)) };
    }
  }
  return null;
}

function buildListHtml(items, ordered, firstNum, resolveLink) {
  let html = ordered ? '<ol' + (firstNum !== 1 ? ' start="' + firstNum + '"' : '') + '>\n' : '<ul>\n';
  for (let k = 0; k < items.length; k++) html += '<li>' + renderInline(items[k], resolveLink) + '</li>\n';
  html += ordered ? '</ol>' : '</ul>';
  return html;
}

function collectListItems(lines, i, N, first) {
  const items = [first.text];
  const ordered = first.ordered;
  const firstNum = first.num;
  i++;
  while (i < N) {
    const l2 = lines[i];
    const m2 = matchListStart(l2);
    if (m2 && m2.ordered === ordered) { items.push(m2.text); i++; continue; }
    if (l2.length >= 2 && l2.charCodeAt(0) === 32 && l2.charCodeAt(1) === 32) {
      const cont = trimST(l2);
      if (cont !== '') { items[items.length - 1] += '\n' + cont; i++; continue; }
    }
    break;
  }
  return { items, ordered, firstNum, next: i };
}

function renderMarkdown(body, resolveLink) {
  const lines = body.split('\n');
  const out = [];
  const toc = [];
  const headingUsed = new Set();
  let excerpt = '';
  let i = 0;
  const N = lines.length;
  while (i < N) {
    const line = lines[i];
    if (line.length === 0) { i++; continue; }
    const c0 = line.charCodeAt(0);
    if (c0 === 32 || c0 === 9) {
      if (isBlankST(line)) { i++; continue; }
      // Indented non-blank line at block start: paragraph text.
    } else if (c0 === 96) {
      const lang = fenceOpenLang(line);
      if (lang !== null) {
        let code = '';
        i++;
        while (i < N && !isFenceClose(lines[i])) {
          code += esc(lines[i]) + '\n';
          i++;
        }
        if (i < N) i++;
        out.push('<pre><code' + (lang !== '' ? ' class="language-' + esc(lang) + '"' : '') + '>' + code + '</code></pre>');
        continue;
      }
    } else if (c0 === 35) {
      const hd = matchHeading(line);
      if (hd) {
        let id = slugify(hd.text);
        if (headingUsed.has(id)) {
          let n = 2;
          while (headingUsed.has(id + '-' + n)) n++;
          id = id + '-' + n;
        }
        headingUsed.add(id);
        const html = renderInline(hd.text, resolveLink);
        if (hd.level === 2 || hd.level === 3) toc.push({ level: hd.level, id, html });
        out.push('<h' + hd.level + ' id="' + id + '">' + html + '</h' + hd.level + '>');
        i++;
        continue;
      }
    } else if (c0 === 45 || c0 === 42) {
      if (isHR(line)) { out.push('<hr>'); i++; continue; }
      const ls = matchListStart(line);
      if (ls) {
        const r = collectListItems(lines, i, N, ls);
        out.push(buildListHtml(r.items, r.ordered, r.firstNum, resolveLink));
        i = r.next;
        continue;
      }
    } else if (c0 === 62) {
      const parts = [];
      while (i < N && lines[i].charCodeAt(0) === 62) {
        let t = lines[i].slice(1);
        if (t.charCodeAt(0) === 32) t = t.slice(1);
        t = trimST(t);
        if (t !== '') parts.push(t);
        i++;
      }
      if (parts.length === 0) out.push('<blockquote>\n</blockquote>');
      else out.push('<blockquote>\n<p>' + renderInline(parts.join('\n'), resolveLink) + '</p>\n</blockquote>');
      continue;
    } else if (c0 >= 48 && c0 <= 57) {
      const ls = matchListStart(line);
      if (ls) {
        const r = collectListItems(lines, i, N, ls);
        out.push(buildListHtml(r.items, r.ordered, r.firstNum, resolveLink));
        i = r.next;
        continue;
      }
    }
    // paragraph
    const plines = [trimST(line)];
    i++;
    while (i < N) {
      const l2 = lines[i];
      if (l2.length === 0) break;
      const d0 = l2.charCodeAt(0);
      if (d0 === 32 || d0 === 9) {
        if (isBlankST(l2)) break;
      } else if (d0 === 96) {
        if (fenceOpenLang(l2) !== null) break;
      } else if (d0 === 35) {
        if (matchHeading(l2)) break;
      } else if (d0 === 45 || d0 === 42) {
        if (isHR(l2)) break;
      }
      plines.push(trimST(l2));
      i++;
    }
    const inner = renderInline(plines.join('\n'), resolveLink);
    if (excerpt === '') excerpt = inner;
    out.push('<p>' + inner + '</p>');
  }
  return { html: out.length ? out.join('\n') + '\n' : '', toc, excerpt };
}

// ---- Markdown: inline ----
function isEscapable(c) {
  return c === 92 || c === 96 || c === 42 || c === 95 || c === 91 || c === 93 || c === 40 || c === 41 || c === 35 || c === 43 || c === 45 || c === 46 || c === 33 || c === 62;
}

function findStrongClose(s, start) {
  const L = s.length;
  let j = start;
  while (j + 1 < L) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < L && isEscapable(s.charCodeAt(j + 1))) { j += 2; continue; }
    if (c === 42 && s.charCodeAt(j + 1) === 42) return j;
    j++;
  }
  return -1;
}

function findEmClose(s, start) {
  const L = s.length;
  let j = start;
  while (j < L) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < L && isEscapable(s.charCodeAt(j + 1))) { j += 2; continue; }
    if (c === 42) {
      if (j + 1 < L && s.charCodeAt(j + 1) === 42) { j += 2; continue; }
      return j;
    }
    j++;
  }
  return -1;
}

function isInlineWS(c) {
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;
}

function tryLink(s, i, resolveLink) {
  const L = s.length;
  let j = i + 1;
  let close = -1;
  while (j < L) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < L && isEscapable(s.charCodeAt(j + 1))) { j += 2; continue; }
    if (c === 93) { close = j; break; }
    j++;
  }
  if (close < 0) return null;
  if (close + 1 >= L || s.charCodeAt(close + 1) !== 40) return null;
  const k = s.indexOf(')', close + 2);
  if (k < 0) return null;
  const target = s.slice(close + 2, k);
  if (target === '') return null;
  for (let t = 0; t < target.length; t++) {
    if (isInlineWS(target.charCodeAt(t))) return null;
  }
  const href = resolveLink(target);
  return { html: '<a href="' + esc(href) + '">' + renderInline(s.slice(i + 1, close), resolveLink) + '</a>', next: k + 1 };
}

function renderInline(s, resolveLink) {
  // Fast path: no markdown constructs at all.
  if (s.indexOf('\\') < 0 && s.indexOf('`') < 0 && s.indexOf('*') < 0 && s.indexOf('[') < 0) return esc(s);
  const out = [];
  const L = s.length;
  let i = 0;
  while (i < L) {
    const c = s.charCodeAt(i);
    if (c === 92 && i + 1 < L && isEscapable(s.charCodeAt(i + 1))) {
      const n = s.charCodeAt(i + 1);
      out.push(n === 38 ? '&amp;' : n === 60 ? '&lt;' : n === 62 ? '&gt;' : n === 34 ? '&quot;' : n === 39 ? '&#39;' : s[i + 1]);
      i += 2;
      continue;
    }
    if (c === 96) {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        out.push('<code>' + esc(s.slice(i + 1, j)) + '</code>');
        i = j + 1;
        continue;
      }
      out.push('`');
      i++;
      continue;
    }
    if (c === 42 && i + 1 < L && s.charCodeAt(i + 1) === 42) {
      const j = findStrongClose(s, i + 2);
      if (j > i + 2) {
        out.push('<strong>' + renderInline(s.slice(i + 2, j), resolveLink) + '</strong>');
        i = j + 2;
        continue;
      }
      out.push('**');
      i += 2;
      continue;
    }
    if (c === 42) {
      const j = findEmClose(s, i + 1);
      if (j >= i + 2) {
        out.push('<em>' + renderInline(s.slice(i + 1, j), resolveLink) + '</em>');
        i = j + 1;
        continue;
      }
      out.push('*');
      i++;
      continue;
    }
    if (c === 91) {
      const r = tryLink(s, i, resolveLink);
      if (r) {
        out.push(r.html);
        i = r.next;
        continue;
      }
      out.push('[');
      i++;
      continue;
    }
    // Plain run: one pass, stop at markdown specials or HTML specials.
    let j = i;
    while (j < L) {
      const d = s.charCodeAt(j);
      if (d === 92 || d === 96 || d === 42 || d === 91 || d === 38 || d === 60 || d === 62 || d === 34 || d === 39) break;
      j++;
    }
    if (j > i) {
      out.push(s.slice(i, j));
      i = j;
      continue;
    }
    if (c === 38) out.push('&amp;');
    else if (c === 60) out.push('&lt;');
    else if (c === 62) out.push('&gt;');
    else if (c === 34) out.push('&quot;');
    else if (c === 39) out.push('&#39;');
    else out.push(s[i]);
    i++;
  }
  return out.join('');
}

// ---- Templates: tokenize + parse ----
function parsePath(s) {
  if (s === '') return null;
  const parts = s.split('.');
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (p === '') return null;
    const c0 = p.charCodeAt(0);
    if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95)) return null;
    for (let i = 1; i < p.length; i++) {
      const c = p.charCodeAt(i);
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95)) return null;
    }
  }
  return parts;
}

function tokenizeTemplate(src) {
  const toks = [];
  const L = src.length;
  let i = 0;
  let textStart = 0;
  while (i < L) {
    if (src.charCodeAt(i) === 123) {
      const n1 = i + 1 < L ? src.charCodeAt(i + 1) : -1;
      if (n1 === 123) {
        let kind, e, adv;
        if (i + 2 < L && src.charCodeAt(i + 2) === 123) {
          e = src.indexOf('}}}', i + 3);
          if (e < 0) return { err: 'a {{{ is not closed' };
          kind = 2; adv = 3;
        } else {
          e = src.indexOf('}}', i + 2);
          if (e < 0) return { err: 'a {{ is not closed' };
          kind = 1; adv = 2;
        }
        if (i > textStart) toks.push({ k: 0, s: src.slice(textStart, i) });
        toks.push({ k: kind, s: src.slice(i + adv, e).trim() });
        i = e + adv;
        textStart = i;
        continue;
      }
      if (n1 === 37) {
        const e = src.indexOf('%}', i + 2);
        if (e < 0) return { err: 'a {% is not closed' };
        const content = src.slice(i + 2, e).trim();
        let standalone = false;
        let after = e + 2;
        let b = i - 1;
        while (b >= 0 && (src.charCodeAt(b) === 32 || src.charCodeAt(b) === 9)) b--;
        if (b < 0 || src.charCodeAt(b) === 10) {
          let f = e + 2;
          while (f < L && (src.charCodeAt(f) === 32 || src.charCodeAt(f) === 9)) f++;
          if (f >= L) { standalone = true; after = L; }
          else if (src.charCodeAt(f) === 10) { standalone = true; after = f + 1; }
        }
        let textEnd = i;
        if (standalone) {
          while (textEnd > textStart && (src.charCodeAt(textEnd - 1) === 32 || src.charCodeAt(textEnd - 1) === 9)) textEnd--;
        }
        if (textEnd > textStart) toks.push({ k: 0, s: src.slice(textStart, textEnd) });
        toks.push({ k: 3, s: content });
        i = after;
        textStart = i;
        continue;
      }
    }
    i++;
  }
  if (L > textStart) toks.push({ k: 0, s: src.slice(textStart, L) });
  return { toks };
}

function parseName(s, i) {
  const L = s.length;
  const c0 = s.charCodeAt(i);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95)) return -1;
  let j = i + 1;
  while (j < L) {
    const c = s.charCodeAt(j);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95) j++;
    else break;
  }
  return j;
}

function parseForTag(c) {
  // 'for <name> in <path>'
  if (!c.startsWith('for ')) return null;
  const ni = parseName(c, 4);
  if (ni < 0) return null;
  if (c.slice(ni, ni + 4) !== ' in ') return null;
  const p = parsePath(c.slice(ni + 4));
  if (!p) return null;
  return { v: c.slice(4, ni), p };
}

function parseIfTag(c) {
  // 'if [not ]<path>'
  if (!c.startsWith('if ')) return null;
  let rest = c.slice(3);
  let neg = false;
  if (rest.startsWith('not ')) { neg = true; rest = rest.slice(4); }
  const p = parsePath(rest);
  if (!p) return null;
  return { neg, p };
}

function parseIncludeTag(c) {
  if (!c.startsWith('include ')) return null;
  const rest = c.slice(8);
  if (rest.length < 2 || rest.charCodeAt(0) !== 34 || rest.charCodeAt(rest.length - 1) !== 34) return null;
  const name = rest.slice(1, -1);
  if (name === '') return null;
  for (let i = 0; i < name.length; i++) {
    const ch = name.charCodeAt(i);
    if (!((ch >= 97 && ch <= 122) || (ch >= 48 && ch <= 57) || ch === 45)) return null;
  }
  return { name };
}

function parseTemplate(src) {
  const t = tokenizeTemplate(src);
  if (t.err) return { err: t.err };
  const toks = t.toks;
  let pos = 0;
  function parseSeq() {
    const nodes = [];
    while (pos < toks.length) {
      const tk = toks[pos];
      if (tk.k === 0) { nodes.push({ t: 0, s: tk.s }); pos++; continue; }
      if (tk.k === 1 || tk.k === 2) {
        const p = parsePath(tk.s);
        if (!p) return { err: JSON.stringify(tk.s) + ' is not a path' };
        nodes.push({ t: tk.k, p });
        pos++;
        continue;
      }
      const c = tk.s;
      if (c === 'else' || c === 'endfor' || c === 'endif') return { nodes, term: c };
      const fr = parseForTag(c);
      if (fr) {
        pos++;
        const body = parseSeq();
        if (body.err) return body;
        if (body.term === null) return { err: 'a for is not closed' };
        if (body.term === 'else') return { err: 'an else outside an if' };
        if (body.term === 'endif') return { err: 'an endif with no open if' };
        pos++;
        nodes.push({ t: 3, v: fr.v, p: fr.p, ch: body.nodes });
        continue;
      }
      const ir = parseIfTag(c);
      if (ir) {
        pos++;
        const thenB = parseSeq();
        if (thenB.err) return thenB;
        if (thenB.term === null) return { err: 'a if is not closed' };
        if (thenB.term === 'endfor') return { err: 'an endfor with no open for' };
        if (thenB.term === 'endif') {
          pos++;
          nodes.push({ t: 4, neg: ir.neg, p: ir.p, then: thenB.nodes, els: null });
          continue;
        }
        // else
        pos++;
        const elseB = parseSeq();
        if (elseB.err) return elseB;
        if (elseB.term === null) return { err: 'a if is not closed' };
        if (elseB.term === 'else') return { err: 'an else outside an if' };
        if (elseB.term === 'endfor') return { err: 'an endfor with no open for' };
        pos++;
        nodes.push({ t: 4, neg: ir.neg, p: ir.p, then: thenB.nodes, els: elseB.nodes });
        continue;
      }
      const ic = parseIncludeTag(c);
      if (ic) {
        nodes.push({ t: 5, name: ic.name });
        pos++;
        continue;
      }
      return { err: '{% ' + c + ' %} is not a tag' };
    }
    return { nodes, term: null };
  }
  const r = parseSeq();
  if (r.err) return { err: r.err };
  if (r.term === 'endfor') return { err: 'an endfor with no open for' };
  if (r.term === 'endif') return { err: 'an endif with no open if' };
  if (r.term === 'else') return { err: 'an else outside an if' };
  return { nodes: r.nodes };
}

// ---- Templates: render ----

function lookup(scopes, path) {
  // Data built by run() never binds a name to undefined or to a function,
  // and scope objects are null-prototype, so direct access is exact here
  // and much cheaper than hasOwnProperty calls on the hot path. The
  // function / __proto__ guards keep inherited properties invisible, as
  // own-property lookup requires.
  let v;
  let found = false;
  for (let si = scopes.length - 1; si >= 0; si--) {
    v = scopes[si][path[0]];
    if (v !== undefined && typeof v !== 'function') { found = true; break; }
  }
  if (!found) return undefined;
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object') return undefined;
    if (path[k] === '__proto__') return undefined;
    v = v[path[k]];
    if (v === undefined || typeof v === 'function') return undefined;
  }
  return v;
}

function valueText(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    let s = '';
    for (let i = 0; i < v.length; i++) {
      if (i) s += ', ';
      s += valueText(v[i]);
    }
    return s;
  }
  return '';
}

function isTruthy(v) {
  if (v === undefined || v === null || v === false || v === '' || v === 0) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

const EMPTY_NODES = [];

function renderNodes(nodes, scopes, depth, templates, out) {
  for (let n = 0; n < nodes.length; n++) {
    const nd = nodes[n];
    if (nd.t === 0) out.push(nd.s);
    else if (nd.t === 1) out.push(esc(valueText(lookup(scopes, nd.p))));
    else if (nd.t === 2) out.push(valueText(lookup(scopes, nd.p)));
    else if (nd.t === 3) {
      const arr = lookup(scopes, nd.p);
      if (Array.isArray(arr)) {
        for (let k = 0; k < arr.length; k++) {
          const sc = Object.create(null);
          sc[nd.v] = arr[k];
          sc.loop = { index: k + 1, first: k === 0, last: k === arr.length - 1, length: arr.length };
          scopes.push(sc);
          renderNodes(nd.ch, scopes, depth, templates, out);
          scopes.pop();
        }
      }
    } else if (nd.t === 4) {
      const tv = isTruthy(lookup(scopes, nd.p));
      const take = nd.neg ? !tv : tv;
      renderNodes(take ? nd.then : (nd.els || EMPTY_NODES), scopes, depth, templates, out);
    } else if (nd.t === 5) {
      if (depth < 8) {
        const tpl = templates[nd.name];
        if (tpl) renderNodes(tpl, scopes, depth + 1, templates, out);
      }
    }
  }
}

function renderTemplate(nodes, scopes, templates) {
  const out = [];
  renderNodes(nodes, scopes, 0, templates, out);
  return out.join('');
}

// ---- Link resolution ----
function isExternalTarget(t) {
  const c0 = t.charCodeAt(0);
  if (c0 === 47 || c0 === 35) return true;
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122))) return false;
  for (let i = 1; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 58) return true;
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46)) return false;
  }
  return false;
}

function resolveRel(dir, p) {
  if (p === '') return null;
  const segs = dir === '' ? [] : dir.split('/');
  const parts = p.split('/');
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    if (s === '' || s === '.') continue;
    if (s === '..') {
      if (segs.length === 0) return null;
      segs.pop();
      continue;
    }
    segs.push(s);
  }
  return segs.join('/');
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

// ---- Main entry ----
export function run(input) {
  SLUG_MEMO = new Map();
  const site = input.site;
  const base = stripTrailingSlashes(site.base_url);
  const report = [];

  // Step 1: sources (sorted by path, CRLF normalized) + statics
  const files = input.files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const sources = [];
  const statics = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.path.endsWith('.md')) sources.push({ path: f.path, content: f.content.replace(/\r\n?/g, '\n') });
    else statics.push(f);
  }

  // Step 2: templates, in code-unit name order
  const templates = Object.create(null);
  const tplNames = Object.keys(input.templates).sort();
  for (let i = 0; i < tplNames.length; i++) {
    const name = tplNames[i];
    const parsed = parseTemplate(input.templates[name]);
    if (parsed.err) report.push('template "' + name + '": ' + parsed.err);
    else templates[name] = parsed.nodes;
  }

  // Step 3: front matter + checks, in sorted path order
  const kept = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const fmR = parseFrontMatter(src.content);
    if (!fmR.ok) { report.push('refused ' + src.path + ': ' + fmR.reason); continue; }
    const fm = fmR.fm;
    if (src.path.startsWith('tags/')) { report.push('refused ' + src.path + ": tags/ is the generator's own"); continue; }
    if (src.path.startsWith('page/')) { report.push('refused ' + src.path + ": page/ is the generator's own"); continue; }
    const isPost = src.path.startsWith('posts/');
    if (isPost && !('date' in fm)) { report.push('refused ' + src.path + ': a post needs a date'); continue; }
    const layout = fm.layout || (isPost ? 'post' : 'page');
    if (!templates[layout]) { report.push('refused ' + src.path + ': layout "' + layout + '" is no template that parses'); continue; }
    if (fm.draft === true) { report.push('draft ' + src.path); continue; }
    kept.push({ path: src.path, fm, body: fmR.body, isPost, layout });
  }

  // Step 4: permalinks
  const usedByDir = new Map();
  usedByDir.set('', new Set(['posts', 'tags', 'page']));
  for (let i = 0; i < kept.length; i++) {
    const k = kept[i];
    const dir = k.isPost ? 'posts' : dirOf(k.path);
    let slug = k.fm.slug || slugify(k.fm.title);
    let used = usedByDir.get(dir);
    if (!used) { used = new Set(); usedByDir.set(dir, used); }
    if (used.has(slug)) {
      let n = 2;
      while (used.has(slug + '-' + n)) n++;
      slug = slug + '-' + n;
    }
    used.add(slug);
    k.dir = dir;
    k.slug = slug;
    k.outPath = dir === '' ? slug + '/index.html' : dir + '/' + slug + '/index.html';
    k.url = base + '/' + (dir === '' ? '' : dir + '/') + slug + '/';
  }

  // Step 5: markdown + links
  const srcMap = new Map();
  const staticSet = new Set();
  for (let i = 0; i < kept.length; i++) srcMap.set(kept[i].path, kept[i]);
  for (let i = 0; i < statics.length; i++) staticSet.add(statics[i].path);
  const brokenSeen = new Set();
  for (let i = 0; i < kept.length; i++) {
    const k = kept[i];
    const srcDir = dirOf(k.path);
    const srcPath = k.path;
    const resolveLink = (target) => {
      if (isExternalTarget(target)) return target;
      const hi = target.indexOf('#');
      const ppart = hi < 0 ? target : target.slice(0, hi);
      const frag = hi < 0 ? '' : target.slice(hi);
      const resolved = resolveRel(srcDir, ppart);
      if (resolved !== null) {
        const pg = srcMap.get(resolved);
        if (pg) return pg.url + frag;
        if (staticSet.has(resolved)) return base + '/' + resolved + frag;
      }
      const key = srcPath + '\n' + target;
      if (!brokenSeen.has(key)) {
        brokenSeen.add(key);
        report.push('broken-link ' + srcPath + ' -> ' + target);
      }
      return target;
    };
    const md = renderMarkdown(k.body, resolveLink);
    k.content = md.html;
    k.toc = md.toc;
    k.excerpt = md.excerpt;
    k.reading = Math.max(1, Math.ceil(wordCount(k.body) / 200));
  }

  // Step 6: post collection (date desc, slug asc); newer/older
  const posts = kept.filter((k) => k.isPost).sort((a, b) => {
    if (a.fm.date !== b.fm.date) return a.fm.date < b.fm.date ? 1 : -1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  for (let i = 0; i < posts.length; i++) {
    posts[i].newer = i > 0 ? posts[i - 1] : null;
    posts[i].older = i < posts.length - 1 ? posts[i + 1] : null;
  }

  // Step 7: tags
  const tagMap = new Map();
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const seen = new Set();
    const names = p.fm.tags || [];
    for (let j = 0; j < names.length; j++) {
      const s = slugify(names[j]);
      if (seen.has(s)) continue;
      seen.add(s);
      let t = tagMap.get(s);
      if (!t) {
        t = { name: names[j], slug: s, url: base + '/tags/' + s + '/', posts: [] };
        tagMap.set(s, t);
      }
      t.posts.push(p);
    }
  }
  const tagsSorted = Array.from(tagMap.values()).sort((a, b) => {
    if (a.posts.length !== b.posts.length) return b.posts.length - a.posts.length;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  const tagsList = tagsSorted.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));

  function cardTags(k) {
    const out = [];
    const seen = new Set();
    const names = k.fm.tags || [];
    for (let j = 0; j < names.length; j++) {
      const s = slugify(names[j]);
      if (seen.has(s)) continue;
      seen.add(s);
      const t = tagMap.get(s);
      if (t) out.push({ name: t.name, slug: s, url: t.url });
      else out.push({ name: names[j], slug: s, url: '' });
    }
    return out;
  }

  function makeCard(k) {
    return {
      title: k.fm.title,
      url: k.url,
      date: k.fm.date || '',
      date_long: k.fm.date ? dateLong(k.fm.date) : '',
      summary: k.fm.summary || '',
      excerpt: k.excerpt,
      reading_minutes: k.reading,
      tags: cardTags(k),
    };
  }

  function neighborObj(p) {
    if (!p) return null;
    return { title: p.fm.title, url: p.url, date: p.fm.date || '', date_long: p.fm.date ? dateLong(p.fm.date) : '' };
  }

  for (let i = 0; i < kept.length; i++) kept[i].card = makeCard(kept[i]);
  const recentCards = posts.slice(0, site.recent).map((p) => p.card);
  const baseData = { site: { title: site.title, base_url: base }, tags: tagsList, recent: recentCards };

  // Step 8: layouts, index, tag pages, statics, report
  const out = Object.create(null);
  for (let i = 0; i < kept.length; i++) {
    const k = kept[i];
    const page = Object.assign(Object.create(null), k.card, {
      slug: k.slug, content: k.content, toc: k.toc,
      newer: neighborObj(k.newer), older: neighborObj(k.older), is_post: k.isPost,
    });
    out[k.outPath] = renderTemplate(templates[k.layout], [baseData, { page }], templates);
  }

  let perPage = site.per_page;
  if (!(perPage >= 1)) perPage = 1;
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
  if (templates.index) {
    for (let pg = 1; pg <= totalPages; pg++) {
      const slice = posts.slice((pg - 1) * perPage, pg * perPage);
      const pager = {
        number: pg,
        total: totalPages,
        url: pg === 1 ? base + '/' : base + '/page/' + pg + '/',
        newer_url: pg > 1 ? (pg === 2 ? base + '/' : base + '/page/' + (pg - 1) + '/') : '',
        older_url: pg < totalPages ? base + '/page/' + (pg + 1) + '/' : '',
      };
      const data = { posts: slice.map((p) => p.card), pager };
      out[pg === 1 ? 'index.html' : 'page/' + pg + '/index.html'] = renderTemplate(templates.index, [baseData, data], templates);
    }
  }
  if (templates.tag) {
    for (let i = 0; i < tagsSorted.length; i++) {
      const t = tagsSorted[i];
      const data = {
        tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => p.card) },
      };
      out['tags/' + t.slug + '/index.html'] = renderTemplate(templates.tag, [baseData, data], templates);
    }
  }
  if (templates.tags) {
    out['tags/index.html'] = renderTemplate(templates.tags, [baseData], templates);
  }
  for (let i = 0; i < statics.length; i++) {
    const f = statics[i];
    if (Object.prototype.hasOwnProperty.call(out, f.path)) {
      report.push('shadowed ' + f.path + ': a built page has its path');
    } else {
      out[f.path] = f.content;
    }
  }

  const pageCount = kept.length - posts.length;
  report.sort();
  report.push('built ' + pageCount + ' pages, ' + posts.length + ' posts, ' + tagsSorted.length + ' tags and ' + statics.length + ' static files');
  out['build-report.txt'] = report.join('\n') + '\n';
  SLUG_MEMO = null;
  return out;
}
