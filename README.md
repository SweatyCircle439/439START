# 439START

a start menu for hyprland

## dependencies
- [ghostty](https://ghostty.org/download)
- [hyprland](https://wiki.hypr.land/Getting-Started/Installation/)



- `building`: [bun](https://bun.sh)

## installing

Download the "startmenu" binary from the latest release

edit your hyprland.conf

```ini
# start the start menu
exec-once = ghostty --class=com.sweatycircle439.startmenu -e /path/to/startmenu

# keybinds
bind = $mainMod, SPACE, togglespecialworkspace, menu
bind = $mainMod, R, togglespecialworkspace, menu

# start menu window rules
windowrulev2 = float,class:com.sweatycircle439.startmenu
windowrulev2 = move 100%-840 100%-610,class:com.sweatycircle439.startmenu
windowrulev2 = size 830 600,class:com.sweatycircle439.startmenu
windowrulev2 = workspace special:menu,class:com.sweatycircle439.startmenu
```

## building from source

```bash
bun i
bun run build
```