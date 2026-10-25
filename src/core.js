/* ===== 신구조문대비표 엔진 (core) ===== */
var SGCore = (function () {
  'use strict';

  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿';
  var GANADA = '가나다라마바사아자차카타파하';

  // 레벨: 0=조, 1=항, 2=호, 3=목, 4=1), 5=가), 6=(1), 7=(가)
  var LEVEL_NAMES = ['조', '항', '호', '목', '세목', '세목', '세목', '세목'];
  var INDENT = [0, 0, 1, 2, 3, 4, 5, 6];

  function norm(s) {
    return (s || '').replace(/[\s 　]+/g, ' ').trim();
  }

  /* ---------- 1. 전처리 ---------- */
  var DATE = '\\d{4}\\s*\\.\\s*\\d{1,2}\\s*\\.\\s*\\d{1,2}\\s*\\.?';
  var RE_ANGLE = new RegExp('<[^<>]*' + DATE + '[^<>]*>', 'g');
  var RE_BRACKET = /\[[^\[\]]*(본조신설|전문개정|제목개정|본조제목개정|시행일|이동|종전|본조삭제|개정|신설|삭제|타법)[^\[\]]*\]/g;

  function cleanLine(line, opt) {
    var s = line.replace(/[​﻿]/g, '').replace(/ |　/g, ' ').replace(/\t/g, ' ');
    if (opt.stripTags) {
      if (/^\s*\[\s*시행일/.test(s)) return '';
      s = s.replace(RE_ANGLE, ' ');
      s = s.replace(RE_BRACKET, ' ');
    }
    return s.replace(/\s+$/, '');
  }

  /* ---------- 2. 구조 파싱 ---------- */
  var RE_JANG = /^제\s*(\d+)\s*(장|절|관)(?:\s*의\s*(\d+))?(?:\s+|$)(.*)$/;
  var RE_JO = /^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(\((?:[^()]|\([^()]*\))*\))?(.*)$/;
  var RE_HANG = new RegExp('^([' + CIRCLED + '])\\s*(.*)$');
  var RE_HO = /^(\d+)(?:\s*의\s*(\d+))?\s*\.(?!\d)\s*(.*)$/;
  var RE_MOK = new RegExp('^([' + GANADA + '])(?:\\s*의\\s*(\\d+))?\\s*\\.\\s*(.*)$');
  var RE_S1 = /^(\d+)\s*\)\s*(.*)$/;
  var RE_S2 = new RegExp('^([' + GANADA + '])\\s*\\)\\s*(.*)$');
  var RE_S3 = /^\(\s*(\d+)\s*\)\s*(.*)$/;
  var RE_S4 = new RegExp('^\\(\\s*([' + GANADA + '])\\s*\\)\\s*(.*)$');
  var RE_BUCHIK = /^(부\s*칙|\[?\s*별\s*표|\[?\s*별\s*지|<\s*별\s*표)/;

  function isDeletedText(t) {
    return /^삭\s*제\.?$/.test(norm(t));
  }

  function mk(level, key, label, text) {
    return { level: level, key: key, label: label, text: text || '', children: [] };
  }

  function matchItem(t) {
    var m;
    if ((m = RE_HANG.exec(t))) return mk(1, [CIRCLED.indexOf(m[1]) + 1], m[1], m[2]);
    if ((m = RE_HO.exec(t))) return mk(2, [+m[1], m[2] ? +m[2] : 0], m[1] + (m[2] ? '의' + m[2] : '') + '.', m[3]);
    if ((m = RE_MOK.exec(t))) return mk(3, [GANADA.indexOf(m[1]) + 1, m[2] ? +m[2] : 0], m[1] + (m[2] ? '의' + m[2] : '') + '.', m[3]);
    if ((m = RE_S1.exec(t))) return mk(4, [+m[1]], m[1] + ')', m[2]);
    if ((m = RE_S2.exec(t))) return mk(5, [GANADA.indexOf(m[1]) + 1], m[1] + ')', m[2]);
    if ((m = RE_S3.exec(t))) return mk(6, [+m[1]], '(' + m[1] + ')', m[2]);
    if ((m = RE_S4.exec(t))) return mk(7, [GANADA.indexOf(m[1]) + 1], '(' + m[1] + ')', m[2]);
    return null;
  }

  function parse(text, opt) {
    opt = opt || {};
    var raw = (text || '').split(/\r\n|\r|\n/);
    var res = { title: '', meta: '', items: [], warnings: [], stats: { jo: 0, lines: 0, skippedHead: 0 } };
    var started = false, stack = [], curHead = null, chapNo = 0, lastNode = null;
    var headLines = [];

    for (var i = 0; i < raw.length; i++) {
      var line = cleanLine(raw[i], opt);
      var t = norm(line);
      if (!t) continue;

      var mj = RE_JANG.exec(t), mo = RE_JO.exec(t);
      // 조 헤더 판정: 제목(괄호)이 있거나, 뒤가 '삭제'이거나 비어 있어야 함
      var isJo = mo && (mo[3] || /^\s*(삭\s*제\.?)?\s*$/.test(mo[4]));

      if (!started) {
        if (mj || isJo) started = true;
        else { headLines.push(t); res.stats.skippedHead++; continue; }
      }
      if (RE_BUCHIK.test(t)) break;
      res.stats.lines++;

      if (mj) {
        var kind = mj[2];
        if (kind === '장') chapNo = +mj[1];
        var hk = kind === '장' ? '장' + mj[1] + '-' + (mj[3] || 0) : kind + chapNo + '-' + mj[1] + '-' + (mj[3] || 0);
        curHead = {
          type: 'head', kind: kind, hkey: hk, label: '제' + mj[1] + kind + (mj[3] ? '의' + mj[3] : ''),
          text: norm(mj[4]), deleted: isDeletedText(mj[4])
        };
        res.items.push(curHead);
        stack = []; lastNode = null;
        continue;
      }
      if (isJo) {
        var jo = mk(0, [+mo[1], mo[2] ? +mo[2] : 0], '제' + mo[1] + '조' + (mo[2] ? '의' + mo[2] : ''), '');
        jo.type = 'jo';
        jo.title = mo[3] ? norm(mo[3]) : '';
        var rest = norm(mo[4]);
        jo.deleted = isDeletedText(rest) && !jo.title;
        if (isDeletedText(rest)) jo.deleted = true;
        res.items.push(jo);
        res.stats.jo++;
        stack = [jo]; lastNode = jo;
        var first = rest && matchItem(rest);
        if (first && first.level === 1) { jo.children.push(first); stack.push(first); lastNode = first; }
        else jo.text = jo.deleted ? '삭제' : rest;
        continue;
      }
      if (!stack.length) { res.warnings.push('조문 밖 문장 무시: ' + t.slice(0, 40)); continue; }

      var it = matchItem(t);
      if (it) {
        while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
        var parent = stack[stack.length - 1];
        parent.children.push(it);
        stack.push(it); lastNode = it;
      } else {
        // 번호 없는 문단 → 직전 항목의 이어지는 문단
        lastNode.text = lastNode.text ? lastNode.text + '\n' + t : t;
      }
    }
    for (var h = 0; h < headLines.length; h++) {
      if (!res.title && !/^[-\/\s]*$/.test(headLines[h])) res.title = headLines[h].replace(/\(\s*약칭\s*:[^)]*\)/, '').trim();
      if (!res.meta && /\[(시행|법률|제정|개정|전부개정|일부개정)/.test(headLines[h])) res.meta = headLines[h];
    }
    walkMarkDeleted(res.items);
    checkOrder(res);
    return res;
  }

  function walkMarkDeleted(nodes) {
    nodes.forEach(function (n) {
      if (n.type === 'head') return;
      if (n.level > 0) n.deleted = isDeletedText(n.text) && !n.children.length;
      walkMarkDeleted(n.children || []);
    });
  }

  function cmpKey(a, b) {
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var x = a[i] || 0, y = b[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  function checkOrder(res) {
    var prev = null;
    res.items.forEach(function (n) {
      if (n.type !== 'jo') return;
      if (prev && cmpKey(prev.key, n.key) >= 0) res.warnings.push('조 번호 순서 이상: ' + prev.label + ' 다음에 ' + n.label);
      prev = n;
      (function rec(node) {
        for (var i = 1; i < node.children.length; i++) {
          var a = node.children[i - 1], b = node.children[i];
          if (a.level === b.level && cmpKey(a.key, b.key) >= 0)
            res.warnings.push(n.label + ': ' + LEVEL_NAMES[b.level] + ' 번호 순서 이상 (' + a.label + ' → ' + b.label + ')');
        }
        node.children.forEach(rec);
      })(n);
    });
  }

  /* ---------- 3. 비교 ---------- */
  function ownLine(n) {
    if (n.type === 'jo') return n.label + n.title + (n.text ? ' ' + n.text : '');
    return (n.label ? n.label + ' ' : '') + n.text;
  }

  function sameTree(a, b) {
    if (a.label !== b.label) return false;
    if (norm(a.text) !== norm(b.text)) return false;
    if (a.type === 'jo' && norm(a.title) !== norm(b.title)) return false;
    if (a.children.length !== b.children.length) return false;
    for (var i = 0; i < a.children.length; i++) {
      if (cmpKey(a.children[i].key, b.children[i].key) !== 0) return false;
      if (!sameTree(a.children[i], b.children[i])) return false;
    }
    return true;
  }

  // 한쪽만 항(①) 구조일 때 다른 쪽 본문을 가상의 제1항으로 감싼다
  function virtualize(a, b) {
    function hasHang(n) { return n.children.length && n.children[0].level === 1; }
    function wrap(n) {
      var c = n.children.length || n.text;
      if (!c) return n;
      var v = mk(1, [1], '', n.text); v.children = n.children; v.virtual = true;
      var copy = {}; for (var k in n) copy[k] = n[k];
      copy.text = ''; copy.children = [v];
      return copy;
    }
    if (hasHang(b) && !hasHang(a) && !a.deleted) a = wrap(a);
    else if (hasHang(a) && !hasHang(b) && !b.deleted) b = wrap(b);
    return [a, b];
  }

  function L(text, level, extra) {
    var o = { text: text, indent: INDENT[level] || 0 };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  // 노드 전체(하위 포함)를 문단 목록으로
  function fullLines(n, prefix) {
    var out = [];
    var head = (prefix || '') + ownLine(n);
    var kids = n.children;
    if (n.type === 'jo' && !n.text && kids.length && kids[0].level === 1) {
      // 제N조(제목) ① ... 형태로 첫 항을 같은 문단에
      var firstLines = fullLines(kids[0], n.label + n.title + ' ');
      firstLines[0].indent = 0;
      return firstLines.concat(flatten(kids.slice(1)));
    }
    pushTextLines(out, head, n.level);
    return out.concat(flatten(kids));
  }
  function pushTextLines(out, text, level) {
    text.split('\n').forEach(function (s, i) { out.push(L(s, level, i ? { cont: true } : null)); });
  }
  function flatten(nodes) {
    var out = [];
    nodes.forEach(function (c) { out = out.concat(fullLines(c, '')); });
    return out;
  }

  function mergeByKey(ca, cb) {
    var i = 0, j = 0, out = [];
    while (i < ca.length || j < cb.length) {
      var a = ca[i], b = cb[j];
      if (a && b) {
        var c = a.level === b.level ? cmpKey(a.key, b.key) : (a.level < b.level ? -1 : 1);
        if (c === 0) { out.push([a, b]); i++; j++; }
        else if (c < 0) { out.push([a, null]); i++; }
        else { out.push([null, b]); j++; }
      } else if (a) { out.push([a, null]); i++; }
      else { out.push([null, b]); j++; }
    }
    return out;
  }

  var SIM_NOTE = 0.5, SIM_STRUCT = 0.5;
  var T = { omitOld: '(생  략)', omitNew: '(현행과 같음)', added: '<신  설>', deleted: '<삭  제>' };

  function row(left, right, kind) { return { left: left, right: right, kind: kind || 'mod' }; }
  function mark(text, level) { return [L(text, level, { marker: true })]; }

  function rangeLabel(nodes) {
    if (nodes.length === 1) return nodes[0].label;
    if (nodes.length === 2) return nodes[0].label + '·' + nodes[1].label;
    return nodes[0].label + ' ∼ ' + nodes[nodes.length - 1].label;
  }

  // 글자 단위 유사도(공백 제외): 공통 글자 수 / 긴 쪽 글자 수
  function tokenSim(x, y) {
    var ta = norm(x).replace(/\s/g, '').split(''), tb = norm(y).replace(/\s/g, '').split('');
    if (!ta.length || !tb.length) return 0;
    if (ta.length * tb.length > 4e6) return ta.join('') === tb.join('') ? 1 : 0.5;
    var mm = lcsMark(ta, tb), c = 0;
    mm[0].forEach(function (m) { if (!m) c++; });
    return c / Math.max(ta.length, tb.length);
  }
  function mainPart(t) { return norm(t).split(/ 다만, | 이 경우 /)[0]; }

  // 단서·후단 신설/삭제 표시
  function clauseNote(r, ta, tb) {
    var na = norm(ta), nb = norm(tb);
    var pats = [['다만,', '단서'], ['이 경우', '후단']];
    function anyMark(t) { return t.indexOf('다만,') >= 0 || t.indexOf('이 경우') >= 0; }
    pats.forEach(function (p) {
      var inA = na.indexOf(p[0]) >= 0, inB = nb.indexOf(p[0]) >= 0;
      if (inB && !anyMark(na) && r.left.length) r.left[r.left.length - 1].suffix = '<' + p[1] + ' 신설>';
      if (inA && !anyMark(nb) && r.right.length) r.right[r.right.length - 1].suffix = '<' + p[1] + ' 삭제>';
    });
  }

  function pairRows(a, b, pa, pb, force, opt) {
    var showGone = !opt || opt.showRemoved !== false;
    if (!a) return [row(mark((pa || '') + T.added, b.level), fullLines(b, pb), 'add')];
    if (!b) return showGone ? [row(fullLines(a, pa), mark((pb || '') + T.deleted, a.level), 'del')] : null;
    if (b.deleted && !a.deleted) return [row(fullLines(a, pa), mark((pb || '') + T.deleted, a.level), 'del')];
    if (a.deleted && !b.deleted) return [row(fullLines(a, pa), fullLines(b, pb), 'mod')];
    if (!force && sameTree(a, b)) return null;

    var ca = a.children, cb = b.children;
    if (!!ca.length !== !!cb.length && tokenSim(a.text, b.text) < SIM_STRUCT)
      return [row(fullLines(a, pa), fullLines(b, pb), 'mod')];
    var r = row([], [], 'mod');
    pushTextLines(r.left, (pa || '') + ownLine(a), a.level);
    pushTextLines(r.right, (pb || '') + ownLine(b), b.level);
    if (opt && opt.clauseNote !== false && tokenSim(mainPart(a.text), mainPart(b.text)) >= SIM_NOTE) clauseNote(r, a.text, b.text);
    var rows = [r];
    if (ca.length || cb.length) rows = rows.concat(childRows(ca, cb, '', '', false, opt));
    return rows;
  }

  function childRows(ca, cb, pa, pb, forceFirst, opt) {
    var pairs = mergeByKey(ca, cb), rows = [], run = [], first = true;
    function prefixA() { return first ? pa : ''; }
    function prefixB() { return first ? pb : ''; }
    function flush() {
      if (!run.length) return;
      var lvl = run[0][0].level;
      rows.push(row(
        [L(prefixA() + rangeLabel(run.map(function (p) { return p[0]; })) + ' ' + T.omitOld, lvl, { omit: true })],
        [L(prefixB() + rangeLabel(run.map(function (p) { return p[1]; })) + ' ' + T.omitNew, lvl, { omit: true })],
        'omit'));
      first = false; run = [];
    }
    pairs.forEach(function (p, idx) {
      var a = p[0], b = p[1];
      var force = forceFirst && idx === 0;
      if (a && b && !force && sameTree(a, b) && a.label && b.label) { run.push(p); return; }
      flush();
      var r = pairRows(a, b, prefixA(), prefixB(), force, opt);
      if (r) { rows = rows.concat(r); first = false; }
    });
    flush();
    return rows;
  }

  function joRows(a, b, opt) {
    if (a && b) {
      var v = virtualize(a, b);
      if (v[0] !== a || v[1] !== b) {
        // 항 구조가 새로 생기거나 없어졌는데 내용도 다르면 조 전체를 통째로 대비
        if (tokenSim(v[0].children[0].text, v[1].children[0].text) < SIM_STRUCT)
          return [row(fullLines(a, ''), fullLines(b, ''), 'mod')];
        a = v[0]; b = v[1];
      }
    }
    if (!a) return [row(mark(T.added, 0), fullLines(b, ''), 'add')];
    if (!b) return (opt && opt.showRemoved === false) ? [] : [row(fullLines(a, ''), mark(T.deleted, 0), 'del')];
    if (b.deleted && !a.deleted) return [row(fullLines(a, ''), mark(T.deleted, 0), 'del')];
    if (a.deleted && b.deleted) return [];
    if (a.deleted && !b.deleted) return [row(fullLines(a, ''), fullLines(b, ''), 'mod')];
    if (sameTree(a, b)) return [];

    var aInline = !a.text && a.children.length && a.children[0].level === 1;
    var bInline = !b.text && b.children.length && b.children[0].level === 1;
    if (aInline && bInline) {
      return childRows(a.children, b.children, a.label + a.title + ' ', b.label + b.title + ' ', false, opt);
    }
    return pairRows(a, b, '', '', true, opt);
  }

  function itemSortKey(items) {
    // 장·절 제목은 바로 다음 조문의 위치에 정렬
    var keys = [], next = [1e9];
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (it.type === 'jo') { next = it.key; keys[i] = { k: it.key, r: 9 }; }
      else keys[i] = { k: next, r: it.kind === '장' ? 0 : it.kind === '절' ? 1 : 2 };
    }
    return keys;
  }

  function compare(oldDoc, newDoc, opt) {
    opt = opt || {};
    var A = oldDoc.items, B = newDoc.items;
    var ka = itemSortKey(A), kb = itemSortKey(B);
    function id(it) { return it.type === 'jo' ? 'J' + it.key.join('-') : 'H' + it.hkey; }
    var mapB = {}, used = {};
    B.forEach(function (it, i) { mapB[id(it)] = i; });

    var seq = [];
    A.forEach(function (it, i) {
      var j = mapB[id(it)];
      if (j !== undefined) { used[j] = 1; seq.push({ a: it, b: B[j], s: kb[j] }); }
      else seq.push({ a: it, b: null, s: ka[i] });
    });
    B.forEach(function (it, j) { if (!used[j]) seq.push({ a: null, b: it, s: kb[j] }); });
    seq.forEach(function (x, i) { x.i = i; });
    seq.sort(function (x, y) {
      return cmpKey(x.s.k, y.s.k) || (x.s.r - y.s.r) || (x.i - y.i);
    });

    var rows = [], stat = { mod: 0, add: 0, del: 0, head: 0 };
    seq.forEach(function (x) {
      var it = x.a || x.b;
      if (it.type === 'head') {
        if (!opt.includeHeads) return;
        var a = x.a, b = x.b, r = null;
        if (!a) r = row(mark(T.added, 0), [L(b.label + ' ' + b.text, 0, { head: true })], 'add');
        else if (!b || (b.deleted && !a.deleted)) r = row([L(a.label + ' ' + a.text, 0, { head: true })], mark(T.deleted, 0), 'del');
        else if (norm(a.text) !== norm(b.text)) r = row([L(a.label + ' ' + a.text, 0, { head: true })], [L(b.label + ' ' + b.text, 0, { head: true })], 'mod');
        if (r) { r.head = true; rows.push(r); stat.head++; }
        return;
      }
      var rs = joRows(x.a, x.b, opt);
      if (rs.length) {
        stat[!x.a ? 'add' : (!x.b || (x.b.deleted && !x.a.deleted)) ? 'del' : 'mod']++;
        rs[0].joStart = true;
        rows = rows.concat(rs);
      }
    });
    if (opt.underline !== false) rows.forEach(markDiff);
    return { rows: rows, stat: stat };
  }

  /* ---------- 4. 변경 부분 표시(단어 단위 LCS) ---------- */
  function tokenize(s) {
    return s.match(/[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+|\s+|[\s\S]/g) || [];
  }
  function lcsMark(ta, tb) {
    var n = ta.length, m = tb.length;
    var ma = new Array(n).fill(true), mb = new Array(m).fill(true);
    // 공통 접두/접미 제거로 계산량 축소
    var s = 0; while (s < n && s < m && ta[s] === tb[s]) { ma[s] = mb[s] = false; s++; }
    var e = 0; while (e < n - s && e < m - s && ta[n - 1 - e] === tb[m - 1 - e]) { ma[n - 1 - e] = mb[m - 1 - e] = false; e++; }
    var A = ta.slice(s, n - e), B = tb.slice(s, m - e), N = A.length, M = B.length;
    if (N && M && N * M <= 4e6) {
      var W = M + 1, dp = new Uint16Array((N + 1) * W);
      for (var i = N - 1; i >= 0; i--) for (var j = M - 1; j >= 0; j--)
        dp[i * W + j] = A[i] === B[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
      i = 0; j = 0;
      while (i < N && j < M) {
        if (A[i] === B[j]) { ma[s + i] = mb[s + j] = false; i++; j++; }
        else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++; else j++;
      }
    }
    return [ma, mb];
  }
  function smooth(tokens, marks) {
    // 공백·문장부호만 남은 표시는 지우고, 표시된 단어 사이의 공백은 이어서 표시
    for (var i = 0; i < tokens.length; i++) {
      if (marks[i] && /^\s+$/.test(tokens[i])) {
        var l = i - 1, r = i + 1;
        marks[i] = l >= 0 && r < tokens.length && marks[l] && marks[r];
      }
    }
    return marks;
  }
  function markDiff(r) {
    if (r.kind !== 'mod') {
      // 신설·삭제는 해당 쪽 전체를 표시
      var side = r.kind === 'add' ? r.right : r.kind === 'del' ? r.left : null;
      if (side) side.forEach(function (ln) { if (!ln.marker) ln.segs = [{ t: ln.text, u: true }]; });
      return;
    }
    var SEP = '\u0001';
    function toks(lines) {
      var t = [], owner = [];
      lines.forEach(function (ln, k) {
        if (k) { t.push(SEP); owner.push(-1); }
        tokenize(ln.text).forEach(function (x) { t.push(x); owner.push(k); });
      });
      return [t, owner];
    }
    var A = toks(r.left), B = toks(r.right);
    var mm = lcsMark(A[0], B[0]);
    function apply(lines, tk, owner, marks) {
      smooth(tk, marks);
      lines.forEach(function (ln) { ln.segs = []; });
      for (var i = 0; i < tk.length; i++) {
        if (owner[i] < 0) continue;
        var segs = lines[owner[i]].segs, u = marks[i] && !lines[owner[i]].marker;
        if (segs.length && segs[segs.length - 1].u === u) segs[segs.length - 1].t += tk[i];
        else segs.push({ t: tk[i], u: u });
      }
    }
    apply(r.left, A[0], A[1], mm[0]);
    apply(r.right, B[0], B[1], mm[1]);
  }

  return { parse: parse, compare: compare, norm: norm, T: T, tokenSim: tokenSim };
})();
if (typeof module !== 'undefined') module.exports = SGCore;
