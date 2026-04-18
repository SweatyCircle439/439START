import getApplications from "./appsApi";
import { Fzf } from 'fzf';
// @ts-ignore
import application from "./dist/application";
import * as fs from "fs";

try { await Bun.file("/tmp/startMenuAppSpawner").delete(); } catch {}
await Bun.write("/tmp/startMenuAppSpawner", Bun.file(application));
fs.chmodSync("/tmp/startMenuAppSpawner", 0o777);

const applicationsApi = Bun.spawn(["/tmp/startMenuAppSpawner"], {
    ipc(_) {},
    env: process.env,
});

const apps = (await getApplications())
    .DOR

let command = ``;
let selectIndex = 0;
let rows = 0;

export function hsvToRGB(h: number, s: number, v: number) {
    let c = Math.max(Math.min(v, 1), 0) * s;
    let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    let m = Math.max(Math.min(v, 1), 0) - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) [r, g] = [c, x];
    else if (h < 120) [r, g] = [x, c];
    else if (h < 180) [g, b] = [c, x];
    else if (h < 240) [g, b] = [x, c];
    else if (h < 300) [r, b] = [x, c];
    else [r, b] = [c, x];
    return {
        r: Math.floor((r + m) * 255),
        g: Math.floor((g + m) * 255),
        b: Math.floor((b + m) * 255)
    }
}

function getGradientColorAt(
    x: number,
    y: number,
    width: number,
    height: number,
    color1: {r: number, g: number, b: number},
    color2: {r: number, g: number, b: number},
    angle: number
) {
    const rad = angle * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const centerX = width / 2;
    const centerY = height / 2;

    const dx = x - centerX;
    const dy = y - centerY;

    const projected = dx * cos + dy * sin;

    const len = Math.abs(width * cos) + Math.abs(height * sin);
    const t = Math.max(0, Math.min(1, (projected / len) + 0.5));

    return {
        r: Math.round(color1.r + (color2.r - color1.r) * t),
        g: Math.round(color1.g + (color2.g - color1.g) * t),
        b: Math.round(color1.b + (color2.b - color1.b) * t)
    };
}

process.stdin.setRawMode(true).setEncoding('utf8');

process.stdin.on('data', (key) => {
    // console.log(JSON.stringify(key));
    if (key === '\u0003') {
        process.exit();
    } else if (key === "") {
        command = command.slice(0, command.length - 1);
        render();
        return;
    } else if (key === "\u001b[A") {
        selectIndex = (selectIndex - 1) % (rows - 6);
        render();
        return
    } else if (key === "\u001b[B") {
        selectIndex = (selectIndex + 1) % (rows - 6);
        render();
        return;
    } else if (typeof key === "string" && key.startsWith("\u001b")) {
        return;
    } else if (key === "\r") {
        const fzf = new Fzf(apps.map(v => v.name));
        const entries = fzf.find(command);
        if (entries.length > 0) {
            applicationsApi.send(apps.find(v => v.name === entries[selectIndex]!.item)!
                .exec.replaceAll(/%./g, "").replaceAll("\"", "").trim());
        }

        command = "";
        selectIndex = 0;
        render();
        return;
    }
    // console.log('You pressed:', key)
    command += key;
    render();
});

async function render () {
    console.clear();
    const columns = process.stdout.columns;
    rows = process.stdout.rows;

    const gradientProps:[number, number, {r: number, g: number, b: number}, {r: number, g: number, b: number}, number] = [
        columns,
        3,
        {r: 239, g: 159, b: 118},
        {r: 202, g: 158, b: 230},
        // {r: 255, g: 0, b: 0},
        // {r: 0, g: 0, b: 255},
        85
    ];

    console.write(`\n \x1b[1;31m`,
        Bun.color(getGradientColorAt(
            0,
            0,
            ...gradientProps,
        ), "ansi") + " 🬕" +
        Array.from({ length: (columns - 6) }, (_, i) =>
            `${Bun.color(getGradientColorAt(
                i,
                0,
                ...gradientProps,
            ), "ansi")}🬂`
        ).join("") +
        Bun.color(getGradientColorAt(
            gradientProps[0],
            0,
            ...gradientProps,
        ), "ansi") + "🬨"
    );

    const BCP = Bun.spawn({
        cmd: ["bc"],
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore"
    });

    BCP.stdin.write(`${command}\n`);
    BCP.stdin.end();

    const code = await BCP.exited;

    const BCPOut = (code === 0 ? await BCP.stdout.text() : "ERR").split("\\").map(v => v.trim()).join("");

    const mathOutMWidth = columns - (12 + Bun.stringWidth(command));

    console.write("   " + Bun.color(getGradientColorAt(
        0,
        2,
        ...gradientProps,
    ), "ansi") + " ▌ " +
        command +
        " ".repeat(columns - (11 + Bun.stringWidth(command) + Math.min(Bun.stringWidth(BCPOut.trim()), mathOutMWidth))) + "= " + (
            Bun.stringWidth(BCPOut.trim()) <= mathOutMWidth ? BCPOut.trim() : BCPOut.trim().slice(0, mathOutMWidth - 3) + "..."
        ) + " " +
    Bun.color(getGradientColorAt(
        gradientProps[0],
        2,
        ...gradientProps,
    ), "ansi") + " ▐")

    console.write(`   \x1b[1;31m`,
        Bun.color(getGradientColorAt(
            0,
            3,
            ...gradientProps,
        ), "ansi") + " 🬲" +
        Array.from({ length: (columns - 6) }, (_, i) =>
            `${Bun.color(getGradientColorAt(
                i,
                3,
                ...gradientProps,
            ), "ansi")}🬭`
        ).join("") +
        Bun.color(getGradientColorAt(
            gradientProps[0],
            3,
            ...gradientProps,
        ), "ansi") + "🬷\n"
    );

    const fzf = new Fzf(apps.map(v => v.name));
    const entries = fzf.find(command);
    entries.slice(0, rows - 6).forEach((entry, i) =>
        console.log(`${Bun.color(getGradientColorAt(
            0,
            i,
            1,
            rows - 6,
            { r: 202, g: 158, b: 230 },
            { r: 48, g: 52, b: 70 },
            90
        ), "ansi")} ${i === selectIndex? "> " : ""}${entry.item}`)
    );

    // console.log(`\x1b[2;f`);
}

render();