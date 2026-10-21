#!/bin/bash
# Wraps site.html (artifact body) into a standalone deployable index.html
set -e
cd "$(dirname "$0")"
{
cat <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Farhad Maleki — AI &amp; Agentic Systems Engineer in Dubai. Ontologies, knowledge graphs, agentic AI and governance layers for regulated systems. CTO at OnePharma.">
<meta name="author" content="Farhad Maleki">
<meta name="theme-color" content="#0D1315">
<meta property="og:type" content="website">
<meta property="og:title" content="Farhad Maleki — AI &amp; Agentic Systems Engineer">
<meta property="og:description" content="Most systems remember. I build systems that understand.">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Farhad Maleki — AI &amp; Agentic Systems Engineer">
<meta name="twitter:description" content="Most systems remember. I build systems that understand.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%230D1315'/><rect x='7' y='7' width='18' height='18' transform='rotate(45 16 16)' fill='%232A5359' stroke='%23CFC09E' stroke-width='1.2'/><circle cx='16' cy='16' r='4' fill='%23C98A5F'/></svg>">
<style>
  html{ color-scheme: dark; }
  body{ margin:0; }
  img{ max-width:100%; }
  [hidden]{ display:none !important; }
</style>
HEAD
# everything in site.html above the <!-- body --> marker goes in head; the rest in body
grep -q '^<!-- body -->$' site.html || { echo "site.html is missing the <!-- body --> marker" >&2; exit 1; }
awk '/^<!-- body -->$/{ print "</head>\n<body>"; next } { print }' site.html
cat <<'FOOT'
</body>
</html>
FOOT
} > index.html
echo "built index.html ($(wc -c < index.html) bytes)"
