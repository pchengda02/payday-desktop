import fs from 'node:fs';
import path from 'node:path';
import {createPackageWithOptions} from '@electron/asar';
import {packager} from '@electron/packager';

const outDir = path.resolve('release-current/Payday-win32-x64');
const asarFile = path.join(outDir, 'resources/app.asar');

if(fs.existsSync(outDir)){
  await createPackageWithOptions('.', asarFile, {
    globOptions: {
      ignore: ['.test-output/**','release*/**','tests/**','node_modules/**','.git/**','package.mjs','*.log','package-lock.json','AGENTS.md','CURSOR_HANDOFF.md']
    }
  });
  console.log(outDir);
}else{
  const folders = await packager({dir:'.',name:'Payday',platform:'win32',arch:'x64',electronVersion:'45.2.1',out:'release-current',overwrite:true,asar:true,prune:true,ignore:[/^\/\.test-output($|\/)/,/^\/release(?:-[^/]+)?($|\/)/,/^\/tests($|\/)/,/^\/node_modules($|\/)/,/^\/\.git($|\/)/,/^\/package\.mjs$/,/\.log$/],icon:'app/icon.ico',win32metadata:{CompanyName:'Payday',FileDescription:'下班倒计时 · Payday',ProductName:'Payday 下班倒计时'}});
  console.log(folders.join('\n'));
}
