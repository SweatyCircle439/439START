# 439START

a start menu for hyprland supporting calculations, application actions and bluetooth.

## dependencies

### required
- [ghostty](https://ghostty.org/download)
- [hyprland](https://wiki.hypr.land/Getting-Started/Installation/)

### for specific features, not needed for base function
- `bluetooth`: bluetoothctl (from bluez, should be installed on your system already)
- `bluetooth`: [nerdfont](https://www.nerdfonts.com/font-downloads)

### for development
- [bun](https://bun.sh)

## installing

Download the "startmenu" binary from the latest release

edit your hyprland.lua

```lua
hl.on("hyprland.start", function()
    hl.exec_cmd("ghostty --class=com.sweatycircle439.startmenu -e /home/sweatycircle439/WebstormProjects/startMenuV2/dist/startmenu")
end)
hl.window_rule({
    name = "439START",
    match = { class = "com.sweatycircle439.startmenu" },
    float = true,
    center = true,
    size = "830 600",
    workspace = "special:menu",
})
```

## building from source

```bash
bun i
bun run build
```