await using terminal = new Bun.Terminal({
    cols: 80,
    rows: 24,
});

process.on("message", async (message: string) => {
    const dispatch = Bun.spawn(["hyprctl", "dispatch", "togglespecialworkspace", "menu"], { terminal });
    await dispatch.exited;

    Bun.spawn(message.split(" "), { terminal });
});

await new Promise(_ => {});