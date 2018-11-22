import { removeSync } from "fs-extra";

if (!module.parent) {
    clean();
}

export default function clean() {
    for (const dir of ["data", "logs", "output"]) {
        console.log(`Clean ${dir}`);
        removeSync(dir);
    }
}
