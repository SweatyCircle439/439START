const iconMap = new Map([
    ["audio-headset", ""],
    ["audio-headphones", "󱡏"],
    ["audio-card", "󰓃"],
    ["audio-video", " "],
    ["input-mouse", "󰍽"],
    ["input-keyboard", "󰌌"],
    ["input-gaming", "󰊴"],
    ["phone", ""],
    ["smartphone", ""],
    ["tablet", "󰓶"],
    ["portable-media-player", "󰲑"],
    ["computer", "󰟀"],
    ["laptop", " "],
    ["desktop", "󰇅"],
    ["network-wireless", " "],
    ["modem", "󰢾"],
    ["printer", "󰐪"],
    ["camera-photo", "󰄀"],
    ["camera-video", "󰄀"],
    ["video-display", "󰍹"],
    ["multimedia-player", "󰦚"],
    ["unknown", "󰂯"]
]);

export async function info(mac: string) {
    const info = Bun.stripANSI(await Bun.$`/usr/bin/bluetoothctl info ${mac}`.text());
    /**
        * output for my switch pro controller:
         * Device **:**:**:**:**:** (public)
         *         Name: Pro Controller
         *         Alias: Pro Controller
         *         Class: 0x00002508 (9480)
         *         Icon: input-gaming
         *         Paired: no
         *         Bonded: no
         *         Trusted: no
         *         Blocked: no
         *         Connected: no
         *         LegacyPairing: no
         *         CablePairing: no
         *         RSSI: 0xffffffca (-54)
     */

    if (info.includes(`${mac} not available`)) throw new Error("Device not found");

    let name = mac;
    const aliasExec = /Alias: (.*)/g.exec(info);
    if (aliasExec && aliasExec[1]) name = aliasExec[1];
    const nameExec = /Name: (.*)/g.exec(info);
    if (nameExec && nameExec[1]) name = nameExec[1];

    let icon = iconMap.get("unknown")!;
    const iconExec = /Icon: (.*)/g.exec(info);
    if (iconExec && iconExec[1]) icon = iconMap.get(iconExec[1]) || iconExec[1];

    let paired = false;
    const pairedExec = /Paired: (.*)/g.exec(info);
    if (pairedExec && pairedExec[1]) paired = pairedExec[1] === "yes";

    let bonded = false;
    const bondedExec = /Bonded: (.*)/g.exec(info);
    if (bondedExec && bondedExec[1]) bonded = bondedExec[1] === "yes";

    let trusted = false;
    const trustedExec = /Trusted: (.*)/g.exec(info);
    if (trustedExec && trustedExec[1]) trusted = trustedExec[1] === "yes";

    let blocked = false;
    const blockedExec = /Blocked: (.*)/g.exec(info);
    if (blockedExec && blockedExec[1]) blocked = blockedExec[1] === "yes";

    let connected = false;
    const connectedExec = /Connected: (.*)/g.exec(info);
    if (connectedExec && connectedExec[1]) connected = connectedExec[1] === "yes";

    return {
        name,
        icon,
        paired,
        bonded,
        trusted,
        blocked,
        connected
    }
}

export async function pair(mac: string) {
    await Bun.$`/usr/bin/bluetoothctl pair ${mac}`.quiet();
}

export async function connect(mac: string) {
    await Bun.$`/usr/bin/bluetoothctl connect ${mac}`.quiet();
}

export async function disConnect(mac: string) {
    await Bun.$`/usr/bin/bluetoothctl disconnect ${mac}`.quiet();
}

export async function remove(mac: string) {
    await Bun.$`/usr/bin/bluetoothctl remove ${mac}`.quiet();
}

export async function* scan(): AsyncGenerator<{
    action: "create" | "remove" | "update";
    mac: string;
    device?: Awaited<ReturnType<typeof info>>
}> {
    const devices = Bun.stripANSI(
        await Bun.$`/usr/bin/bluetoothctl devices`.text()).split("\n").map(v => v.trim().split(" ")
    );

    for (const device of devices) {
        device.shift();

        const mac = device.shift();
        if (!mac) continue;

        try {
            yield {
                action: "create",
                device: await info(mac),
                mac
            }
        } catch {}
    }

    try { await Bun.$`/usr/bin/bluetoothctl scan off`.quiet() } catch {};

    const scanner = Bun.spawn(["/usr/bin/bluetoothctl", "--timeout", "10", "scan", "on"], {
        stdin: "ignore",
        stderr: "ignore",
        stdout: "pipe",
    });

    const reader = scanner.stdout.getReader();
    const decoder = new TextDecoder();

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const out = Bun.stripANSI(decoder.decode(value, { stream: true })).split("\n")[0]!.trim();

            const reg = /\[(.{3})] Device ([0-9A-F:]+) ?.*/;
            const result = reg.exec(out);
            if (!result || !result[1] || !result[2]) continue;

            const action = result[1];
            const mac = result[2];
            if (action === "DEL") {
                yield {
                    action: "remove",
                    mac
                }
                continue;
            }
            try {
                const device = await info(mac);
                if (device.name === mac.replaceAll(":", "-")) continue;
                yield {
                    action: action === "NEW" ? "create" : "update",
                    device,
                    mac
                };
            } catch {}
        }
    } finally {
        reader.releaseLock();
    }

    await scanner.exited;
}

// const scanner = scan();
//
// for await (const device of scanner) {
//     console.log(device);
// }