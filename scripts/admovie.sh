#!/usr/bin/env bash
# Assembles the ad videos from frames recorded by scripts/admovie.mjs.
# Usage: scripts/admovie.sh <framesRoot> [outDir]   (framesRoot/<scene>/f0000.jpg …)
# Output: 1080×1920, 30 fps, H.264 + silent AAC (add a trending sound in the ad platform's editor).
set -euo pipefail
FR=${1:?frames root}; OUT=${2:-marketing/ads}; mkdir -p "$OUT"
FONT=${FONT:-/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf}
T=$(mktemp -d)
txt() { printf '%s' "$2" > "$T/$1.txt"; }

# big caption: textfile, y, start, end, size, color
cap() {
  echo "drawtext=fontfile=$FONT:textfile=$T/$1.txt:fontsize=$5:fontcolor=$6:borderw=7:bordercolor=black@0.85:line_spacing=6:x=(w-text_w)/2:y=$2:enable='between(t,$3,$4)':alpha='if(lt(t,$3+0.15),(t-$3)/0.15,1)'"
}

# clip <scene> <startFrame> <frames> -> T/<name>.mp4 (scaled, with captions)
clip() {
  local name=$1 scene=$2 start=$3 n=$4 filt=$5
  ffmpeg -loglevel error -y -framerate 30 -start_number "$start" -i "$FR/$scene/f%04d.jpg" -frames:v "$n" \
    -vf "scale=1080:1920:flags=lanczos,setsar=1,$filt" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p "$T/$name.mp4"
}

# end card from the clip's last frame: blurred + darkened, title, call to action
endcard() {
  local name=$1 scene=$2 last
  last=$(ls "$FR/$scene" | sort | tail -1)
  txt title 'DEAD SIGNAL'; txt sub 'Free in your browser
No download'; txt url 'deadsignal.info'
  ffmpeg -loglevel error -y -loop 1 -framerate 30 -i "$FR/$scene/$last" -t 2.5 \
    -vf "scale=1080:1920:flags=lanczos,setsar=1,boxblur=18:2,eq=brightness=-0.28:saturation=1.2,\
drawtext=fontfile=$FONT:textfile=$T/title.txt:fontsize=150:fontcolor=#5ef2ff:borderw=8:bordercolor=black:x=(w-text_w)/2:y=640,\
drawtext=fontfile=$FONT:textfile=$T/sub.txt:fontsize=74:fontcolor=white:borderw=6:bordercolor=black:line_spacing=10:x=(w-text_w)/2:y=880,\
drawbox=x=170:y=1150:w=740:h=150:color=#ffd34d@1:t=fill,\
drawtext=fontfile=$FONT:textfile=$T/url.txt:fontsize=78:fontcolor=#141820:x=(w-text_w)/2:y=1180" \
    -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p "$T/$name-end.mp4"
}

join() {
  local name=$1; shift
  printf "file '%s'\n" "$@" > "$T/$name.list"
  ffmpeg -loglevel error -y -f concat -safe 0 -i "$T/$name.list" -f lavfi -i anullsrc=r=44100:cl=stereo -shortest \
    -c:v libx264 -preset veryfast -crf 19 -pix_fmt yuv420p -r 30 -c:a aac -b:a 96k -movflags +faststart "$OUT/$name.mp4"
  echo "$OUT/$name.mp4"
}

# 1. Horde: the scale of it
txt h1 '1 COURIER
VS 500 ZOMBIES'; txt h2 'ONE THUMB.
ALL CHAOS.'; txt h3 'EVOLVE YOUR GUNS'
clip horde horde 0 375 "$(cap h1 230 0 2.8 120 white),$(cap h2 230 3.2 7.2 110 white),$(cap h3 1500 7.6 12.5 96 '#ffd34d')"
endcard horde horde; join dead-signal-horde "$T/horde.mp4" "$T/horde-end.mp4"

# 2. Flamethrower power fantasy
txt f1 'POV: YOUR FLAMETHROWER
JUST EVOLVED'; txt f2 'PICK AN UPGRADE
EVERY LEVEL'; txt f3 'BURN IT ALL DOWN'
clip flame flame 0 375 "$(cap f1 230 0 3.2 96 white),$(cap f2 230 3.6 7.6 104 white),$(cap f3 1500 8 12.5 104 '#ff7a1f')"
endcard flame flame; join dead-signal-flamethrower "$T/flame.mp4" "$T/flame-end.mp4"

# 3. Boss
txt b1 'THE TOWER WALKS'; txt b2 'CAN YOU SURVIVE
5 MINUTES?'; txt b3 '20 SECTORS. 5 BOSSES.'
clip boss boss 0 375 "$(cap b1 230 0 3.0 120 '#ff4d3d'),$(cap b2 230 3.4 8.2 110 white),$(cap b3 1500 8.6 12.5 88 '#5ef2ff')"
endcard boss boss; join dead-signal-boss "$T/boss.mp4" "$T/boss-end.mp4"

# 4. Minute 1 vs minute 5
txt m1 'MINUTE 1'; txt m2 'MINUTE 5'
clip m1 start 0 165 "$(cap m1 240 0 5.5 140 white)"
clip m5 horde 30 210 "$(cap m2 240 0 7 140 '#ffd34d')"
endcard m5 horde; join dead-signal-minute1-vs-minute5 "$T/m1.mp4" "$T/m5.mp4" "$T/m5-end.mp4"
rm -rf "$T"
