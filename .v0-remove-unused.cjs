const fs = require('fs')
const ts = require('typescript')
const report = JSON.parse(fs.readFileSync('/tmp/eslint-report.json', 'utf8'))
for (const result of report) {
  const source = fs.readFileSync(result.filePath, 'utf8')
  const sf = ts.createSourceFile(result.filePath, source, ts.ScriptTarget.Latest, true, result.filePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  for (const message of result.messages.filter((item) => item.ruleId === '@typescript-eslint/no-unused-vars')) {
    const offset = sf.getPositionOfLineAndCharacter(message.line - 1, message.column - 1)
    let found
    function visit(node) {
      if (offset >= node.getStart(sf) && offset < node.getEnd()) {
        found = node
        ts.forEachChild(node, visit)
      }
    }
    visit(sf)
    const chain = []
    for (let node = found; node && chain.length < 7; node = node.parent) chain.push(ts.SyntaxKind[node.kind])
    console.log(`${result.filePath.replace('/vercel/share/v0-project/', '')}:${message.line}:${message.column} ${message.message} :: ${chain.join(' > ')}`)
  }
}
