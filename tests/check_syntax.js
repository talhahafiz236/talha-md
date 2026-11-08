'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let count = 0;
function checkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
            if (f !== 'node_modules' && f !== '.git' && f !== 'tests') {
                checkDir(full);
            }
        } else if (f.endsWith('.js')) {
            try {
                execSync(`node -c "${full}"`);
                count++;
            } catch (e) {
                console.error('Syntax error in:', full);
                process.exit(1);
            }
        }
    }
}

checkDir('.');
console.log(`PASSED: ${count} JavaScript files verified with ZERO syntax errors!`);
