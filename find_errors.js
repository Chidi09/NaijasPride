const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

const isComponentOrService = (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts');

walkDir('/root/dev/naijaspride/apps/web/src', (f) => {
  if (isComponentOrService(f)) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes('ngOnInit') || content.includes('constructor')) {
      const windowMatch = content.match(/ngOnInit.*?\{[\s\S]*?window\./);
      const documentMatch = content.match(/ngOnInit.*?\{[\s\S]*?document\./);
      if (windowMatch) console.log('Found window in ngOnInit:', f);
      if (documentMatch) console.log('Found document in ngOnInit:', f);
    }
  }
});
