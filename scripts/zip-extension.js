const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const outputFile = path.join(releaseDir, 'cleaner.zip');
const tempOutputFile = path.join(releaseDir, 'cleaner.tmp.zip');

const entriesToInclude = ['manifest.json', 'background.js', 'README.md', 'icons', 'src', 'tab'];

function createZip() {
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir);
  }

  if (fs.existsSync(tempOutputFile)) {
    fs.rmSync(tempOutputFile, { force: true });
  }

  const python = process.platform === 'win32' ? 'python' : 'python3';

  const pythonCode = [
    'import os, sys, zipfile',
    'root = sys.argv[1]',
    'output = sys.argv[2]',
    'entries = sys.argv[3:]',
    'with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:',
    '    for entry in entries:',
    '        full = os.path.join(root, entry)',
    '        if os.path.isdir(full):',
    '            for current_root, dirs, files in os.walk(full):',
    '                dirs.sort()',
    '                files.sort()',
    '                for name in files:',
    '                    src = os.path.join(current_root, name)',
    '                    arc = os.path.relpath(src, root)',
    '                    zf.write(src, arc)',
    '        else:',
    '            zf.write(full, os.path.relpath(full, root))',
    'print(output)'
  ].join('\n');

  const args = [
    '-c',
    pythonCode,
    root,
    tempOutputFile,
    ...entriesToInclude
  ];

  execFileSync(python, args, { encoding: 'utf8' });

  if (fs.existsSync(outputFile)) {
    fs.rmSync(outputFile, { force: true });
  }

  fs.renameSync(tempOutputFile, outputFile);

  console.log(`Created ${path.relative(root, outputFile)}`);
}

createZip();
