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
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Farhad Maleki — AI &amp; Agentic Systems Engineer in Dubai. Ontologies, knowledge graphs, agentic AI and governance layers for regulated systems. CTO at OnePharma.">
<meta name="author" content="Farhad Maleki">
<meta name="theme-color" content="#0C0C0E">
<meta property="og:type" content="website">
<meta property="og:title" content="Farhad Maleki — AI &amp; Agentic Systems Engineer">
<meta property="og:description" content="Most systems remember. I build systems that understand.">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Farhad Maleki — AI &amp; Agentic Systems Engineer">
<meta name="twitter:description" content="Most systems remember. I build systems that understand.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%230C0C0E'/><circle cx='16' cy='16' r='5' fill='%23E9A03B'/><g stroke='%235FA8B8' stroke-width='1.4' fill='none'><path d='M16 16 L6 7M16 16 L26 8M16 16 L7 25M16 16 L25 24'/></g><g fill='%235FA8B8'><circle cx='6' cy='7' r='2.4'/><circle cx='26' cy='8' r='2.4'/><circle cx='7' cy='25' r='2.4'/><circle cx='25' cy='24' r='2.4'/></g></svg>">
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
