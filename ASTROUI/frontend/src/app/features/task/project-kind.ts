/** The kind of project, from the manifest it declares; it only chooses the three example requests. */
export function kindOf(manifest: string | undefined): 'python' | 'web' | 'jvm' | 'generic' {
  const m = (manifest ?? '').toLowerCase();
  if (m.endsWith('pyproject.toml') || m.endsWith('setup.py') || m.endsWith('requirements.txt')) return 'python';
  if (m.endsWith('package.json')) return 'web';
  if (m.endsWith('pom.xml') || m.includes('build.gradle')) return 'jvm';
  return 'generic';
}
