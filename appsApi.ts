import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as ini from 'ini';
import { createCanvas } from 'canvas';
import { execSync } from 'child_process';

function findAllDesktopFiles(dir: string) {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findAllDesktopFiles(full));
        } else if (entry.isFile() || entry.isSymbolicLink()) {
            try {
                files.push(full);
            } catch {}
        }
    }
    return files;
}

function parseXPM(xpmString: string) {
    const lines = xpmString
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('"'))
        .map(l => l.replace(/^"/, '').replace(/[";,]?$/, ''));
    const [width, height, numColors, charsPerPixel] = lines[0].split(' ').map(x => parseInt(x, 10));
    const colorMap: Record<string, string> = {};
    for (let i = 1; i <= numColors; i++) {
        const line = lines[i];
        const key = line.slice(0, charsPerPixel);
        const rest = line.slice(charsPerPixel).trim();
        const colorMatch = rest.match(/c\s+(#[0-9A-Fa-f]{6}|None|[a-zA-Z]+)/);
        colorMap[key] = colorMatch ? colorMatch[1] : 'rgba(0,0,0,0)';
    }
    const pixels = lines.slice(1 + numColors);
    return { width, height, pixels, colorTable: colorMap, charsPerPixel };
}

function xpmToPNGDataURL(xpmString: string) {
    const { width, height, pixels, colorTable, charsPerPixel } = parseXPM(xpmString);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    for (let y = 0; y < height; y++) {
        const row = pixels[y];
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const key = row.substr(x * charsPerPixel, charsPerPixel);
            const color = colorTable[key];
            if (!color) { data[idx + 3] = 0; continue; }
            const rgba = color.startsWith('#') ? hexToRgba(color) : nameToRgba(color);
            data.set(rgba, idx);
        }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
}

function hexToRgba(hex: string) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255, 255];
}

function nameToRgba(name: string) {
    const canvas = createCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = name;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
}

const appDirs = process.env.XDG_DATA_DIRS!.split(":")
    .concat((process.env.XDG_DATA_HOME || path.join(process.env.HOME!, '.local/share')).split(":"))
    .concat(["/var/lib/flatpak/exports/share", path.join(process.env.HOME, ".local/share/flatpak/exports/share")])
    .map(v => path.join(v, 'applications'));

const iconDirs = [
    '/usr/share/icons/',
    '/usr/local/share/icons/',
    path.join(process.env.HOME!, '.icons/'),
    '/usr/share/pixmaps/'
];

const extensions = ['.png', '.jpg', '.jpeg', '.svg', '.xpm'];

function findIconPath(iconName: string) {
    if (!iconName) return null;
    if (iconName.includes('/') && fs.existsSync(iconName)) return iconName;
    const themes = ['hicolor', 'Adwaita', 'Papirus'];
    const sizes = ['512x512','256x256','128x128','64x64','48x48','32x32','24x24','16x16'];
    const places = ['apps','actions','categories'];
    for (const dir of iconDirs) {
        for (const theme of themes) {
            for (const size of sizes) {
                for (const place of places) {
                    for (const ext of extensions) {
                        const p = path.join(dir, theme, size, place, `${iconName}${ext}`);
                        if (fs.existsSync(p)) return p;
                    }
                }
            }
        }
    }
    for (const dir of iconDirs) {
        for (const ext of extensions) {
            const p = path.join(dir, `${iconName}${ext}`);
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

async function iconToDataUrl(filePath: string) {
    if (!filePath) return null;
    if (filePath.endsWith('.xpm')) return xpmToPNGDataURL(fs.readFileSync(filePath, 'utf8'));
    try {
        return `data:image/png;base64,@invalid`;
    } catch { return null; }
}

export interface App { name: string; exec: string; icon: string | null; id: number; desktopFileName: string }
export interface AppDOR extends App { categories: string[] }
export interface CategorieInfo { displayName: string; description: string | null; icon: string | null; id: string }
export interface Categorie extends CategorieInfo { apps: App[] }
export interface AppsByCategory { categories: Categorie[] }

export async function getCategoryInfo(id: string) {
    const DFPath = path.join('/usr/share/desktop-directories', `${id}.directory`);
    if (!fs.existsSync(DFPath)) return { displayName: id, description: null, icon: null, id } as CategorieInfo;
    const parsed = ini.parse(fs.readFileSync(DFPath, 'utf-8'));
    const entry = parsed['Desktop Entry'];
    const iconPath = findIconPath(entry.Icon);
    return {
        displayName: entry.Name || id,
        description: entry.Comment || null,
        icon: iconPath ? await iconToDataUrl(iconPath) : null,
        id
    } as CategorieInfo;
}

async function parseDesktopFile(file: string, id: number) {
    const content = fs.readFileSync(file, 'utf8');
    const parsed = ini.parse(content);
    const entry = parsed['Desktop Entry'];
    if (!entry || entry.Type !== 'Application' || entry.NoDisplay === 'true') return null;
    const name = entry.Name;
    const exec = entry.Exec;
    if (!exec) return null;
    const categories = entry.Categories?.split(';').filter(Boolean) || ['Uncategorized'];
    const iconPath = findIconPath(entry.Icon);
    return { id, name, exec, iconPath, categories, desktopFileName: path.basename(file) };
}

async function getDesktopApps() {
    const apps: AppDOR[] = [];
    let idCounter = 0;
    for (const dir of appDirs) {
        console.log(dir);
        if (!fs.existsSync(dir)) continue;
        const files = findAllDesktopFiles(dir);
        for (const file of files) {
            // if (fs.statSync(file).isDirectory()) continue;
            const app = await parseDesktopFile(file, idCounter++);
            if (file.includes("obsidian")) {
                console.log(file);
                console.log(app);
            }
            if (app) apps.push(app as AppDOR);
        }
    }
    return apps;
}

function getAppStreamApps() {
    try {
        const output = execSync('appstreamcli list --only-installed --quiet', { encoding: 'utf-8' });
        const apps: { name: string; exec?: string; icon?: string; categories?: string[] }[] = [];
        for (const line of output.split('\n').filter(Boolean)) {
            apps.push({ name: line, exec: line, categories: ['Uncategorized'] });
        }
        return apps;
    } catch { return []; }
}

export default async function getApplications() {
    const DOR: AppDOR[] = [];
    const appsByCategory: AppsByCategory = { categories: [] };
    let idCounter = 0;
    const desktopApps = await getDesktopApps();
    const appStreamApps = getAppStreamApps();

    const allApps = [...desktopApps, ...appStreamApps.map(a => ({ ...a, id: idCounter++, iconPath: null, categories: ['Uncategorized'], desktopFileName: '' }))];

    const iconPromises = allApps.map(async app => {
        const iconData = app.iconPath ? await iconToDataUrl(app.iconPath) : null;
        const appDOR: AppDOR = {
            id: app.id,
            name: app.name,
            exec: app.exec!,
            icon: iconData,
            categories: app.categories!,
            desktopFileName: app.desktopFileName || ''
        };
        DOR.push(appDOR);
        for (const cat of appDOR.categories) {
            let category = appsByCategory.categories.find(c => c.id === cat);
            if (!category) category = { apps: [], ...(await getCategoryInfo(cat)) };
            if (!appsByCategory.categories.find(c => c.id === cat)) appsByCategory.categories.push(category);
            category.apps.push(appDOR);
        }
    });

    await Promise.all(iconPromises);

    // fs.writeFileSync(path.join(__dirname, 'apps.json'), JSON.stringify(appsByCategory, null, 4));

    return { DOR, appsByCategory };
}

