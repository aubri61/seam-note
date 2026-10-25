import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after } from 'node:test'
import ts from 'typescript'

// Exercise real TypeScript modules using the project's existing test tools.
const temporary = mkdtempSync(join(tmpdir(), 'seam-note-api-tests-'))
for (const name of [
  'app/routing/noteRoutes',
  'lib/api/types', 'lib/api/client', 'lib/query/queryKeys', 'lib/query/queryClient',
  'features/folders/folderApi', 'features/folders/folderQueries',
  'features/notes/noteApi', 'features/notes/noteQueries', 'features/notes/notePresentation',
  'features/notes/noteDrafts', 'features/notes/draftNavigation',
  'features/workspace/workspaceActions', 'features/workspace/workspaceMutations',
  'features/workspace/workspaceApi', 'features/workspace/workspaceQueries', 'features/workspace/workspaceTree',
]) {
  const source = readFileSync(new URL(`../../src/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
  })
  const executable = outputText.replace(/(from\s+['"])([^'"]+)(['"])/g, (_, before, specifier, end) => {
    const local = specifier.startsWith('@/') ? specifier.slice(2)
      : specifier.startsWith('.') ? posix.normalize(posix.join(posix.dirname(name), specifier)) : null
    const resolved = local ? pathToFileURL(join(temporary, `${local}.mjs`)).href : import.meta.resolve(specifier)
    return `${before}${resolved}${end}`
  })
  const filename = join(temporary, `${name}.mjs`)
  mkdirSync(dirname(filename), { recursive: true })
  writeFileSync(filename, executable)
}
after(() => rmSync(temporary, { recursive: true, force: true }))
export const load = name => import(pathToFileURL(join(temporary, `${name}.mjs`)).href)
