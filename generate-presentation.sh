#!/bin/bash

# Memorial Slideshow - Presentation Generator
# Scans photos/ directory and generates presentation.json with randomized transitions
# and interspersed bible verses.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOTOS_DIR="$SCRIPT_DIR/photos"
VERSES_FILE="$SCRIPT_DIR/verses.json"
OUTPUT_FILE="$SCRIPT_DIR/presentation.json"

# Settings
DEFAULT_DURATION=8000
TRANSITION_DURATION=1500
START_SLIDE_DURATION=15000
VERSE_DURATION=10000
PHOTOS_BETWEEN_VERSES=3  # Insert verse every N photos

# Available transitions
TRANSITIONS=("slideLeft" "slideRight" "slideUp" "slideDown" "fadeBlack" "fadeWhite" "hearts" "heavensLight")

# Verse-appropriate transitions (more gentle)
VERSE_TRANSITIONS=("fadeBlack" "fadeWhite" "heavensLight")

# Verse colors
VERSE_BG_COLORS=('#9CAF88' '#8BA4B4' '#F5F0E6' '#C9B1A1' '#B8A9C9')
VERSE_TEXT_COLORS=('#FFFFFF' '#FFFFFF' '#333333' '#FFFFFF' '#FFFFFF')

# Function to get random element from array
random_element() {
    local arr=("$@")
    echo "${arr[$RANDOM % ${#arr[@]}]}"
}

# Check if photos directory exists
if [ ! -d "$PHOTOS_DIR" ]; then
    echo "Creating photos directory: $PHOTOS_DIR"
    mkdir -p "$PHOTOS_DIR"
    echo "Please add photos to the photos/ directory and run this script again."
    exit 1
fi

# Check if verses file exists
if [ ! -f "$VERSES_FILE" ]; then
    echo "Error: verses.json not found at $VERSES_FILE"
    exit 1
fi

# Find all image files and store in array
echo "Scanning photos directory..."
PHOTOS=()
START_PHOTO=""

while IFS= read -r -d '' photo; do
    basename=$(basename "$photo")
    name="${basename%.*}"

    if [[ "$name" == "start" ]]; then
        START_PHOTO="$photo"
        echo "Found start image: $basename"
    else
        PHOTOS+=("$photo")
    fi
done < <(find "$PHOTOS_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o -iname "*.gif" \) -print0 | sort -z)

START_COUNT=0
if [ -n "$START_PHOTO" ]; then
    START_COUNT=1
fi
TOTAL_PHOTOS=$((${#PHOTOS[@]} + START_COUNT))

if [ ${#PHOTOS[@]} -eq 0 ] && [ -z "$START_PHOTO" ]; then
    echo "No photos found in $PHOTOS_DIR"
    echo "Supported formats: jpg, jpeg, png, webp, gif"
    exit 1
fi

echo "Found $TOTAL_PHOTOS photos"

# Shuffle photos array using Fisher-Yates
n=${#PHOTOS[@]}
for ((i = n - 1; i > 0; i--)); do
    j=$((RANDOM % (i + 1)))
    tmp="${PHOTOS[i]}"
    PHOTOS[i]="${PHOTOS[j]}"
    PHOTOS[j]="$tmp"
done

echo "Photos shuffled"

# Load verse count
VERSE_COUNT=$(jq '.verses | length' "$VERSES_FILE")
echo "Found $VERSE_COUNT verses"

# Start building JSON
echo "Generating presentation.json..."

# Write header
cat > "$OUTPUT_FILE" << 'EOF'
{
  "settings": {
    "defaultDuration": 8000,
    "defaultTransitionDuration": 1500,
    "startSlideDuration": 15000,
    "verseDuration": 10000,
    "kenBurnsEnabled": true
  },
  "slides": [
EOF

SLIDE_COUNT=0
VERSE_INDEX=0
PHOTO_COUNT_SINCE_VERSE=0

# Function to write photo slide
write_photo_slide() {
    local photo_path="$1"
    local is_start="$2"
    local needs_comma="$3"

    local relative_path="${photo_path#$SCRIPT_DIR/}"
    local transition=$(random_element "${TRANSITIONS[@]}")
    local duration=$DEFAULT_DURATION

    if [ "$is_start" = "true" ]; then
        duration=$START_SLIDE_DURATION
        transition="fadeBlack"
    fi

    if [ "$needs_comma" = "true" ]; then
        echo "," >> "$OUTPUT_FILE"
    fi

    if [ "$is_start" = "true" ]; then
        cat >> "$OUTPUT_FILE" << EOF
    {
      "type": "photo",
      "src": "$relative_path",
      "duration": $duration,
      "transition": "$transition",
      "kenBurns": true,
      "isStart": true
    }
EOF
    else
        cat >> "$OUTPUT_FILE" << EOF
    {
      "type": "photo",
      "src": "$relative_path",
      "duration": $duration,
      "transition": "$transition",
      "kenBurns": true
    }
EOF
    fi

    SLIDE_COUNT=$((SLIDE_COUNT + 1))
}

# Function to write verse slide
write_verse_slide() {
    local verse_idx=$1

    local verse_text=$(jq -r ".verses[$verse_idx].text" "$VERSES_FILE")
    local verse_text_thai=$(jq -r ".verses[$verse_idx].textThai" "$VERSES_FILE")
    local verse_ref=$(jq -r ".verses[$verse_idx].reference" "$VERSES_FILE")
    local verse_ref_thai=$(jq -r ".verses[$verse_idx].referenceThai" "$VERSES_FILE")
    local transition=$(random_element "${VERSE_TRANSITIONS[@]}")

    # Cycle through color palette
    local color_idx=$((verse_idx % 5))
    local bg_color="${VERSE_BG_COLORS[$color_idx]}"
    local text_color="${VERSE_TEXT_COLORS[$color_idx]}"

    # Escape double quotes in verse text for JSON
    verse_text=$(echo "$verse_text" | sed 's/"/\\"/g')
    verse_text_thai=$(echo "$verse_text_thai" | sed 's/"/\\"/g')

    echo "," >> "$OUTPUT_FILE"
    cat >> "$OUTPUT_FILE" << EOF
    {
      "type": "verse",
      "text": "$verse_text",
      "textThai": "$verse_text_thai",
      "reference": "$verse_ref",
      "referenceThai": "$verse_ref_thai",
      "background": "$bg_color",
      "textColor": "$text_color",
      "duration": $VERSE_DURATION,
      "transition": "$transition"
    }
EOF

    SLIDE_COUNT=$((SLIDE_COUNT + 1))
}

# Add start photo first if it exists
NEEDS_COMMA="false"
if [ -n "$START_PHOTO" ]; then
    write_photo_slide "$START_PHOTO" "true" "false"
    NEEDS_COMMA="true"
fi

# Add remaining photos with interspersed verses
for photo in "${PHOTOS[@]}"; do
    write_photo_slide "$photo" "false" "$NEEDS_COMMA"
    NEEDS_COMMA="true"
    PHOTO_COUNT_SINCE_VERSE=$((PHOTO_COUNT_SINCE_VERSE + 1))

    # Add verse every N photos
    if [ $PHOTO_COUNT_SINCE_VERSE -ge $PHOTOS_BETWEEN_VERSES ] && [ $VERSE_INDEX -lt $VERSE_COUNT ]; then
        write_verse_slide $VERSE_INDEX
        VERSE_INDEX=$((VERSE_INDEX + 1))
        PHOTO_COUNT_SINCE_VERSE=0
    fi
done

# Add any remaining verses at the end (limited to avoid too many)
MAX_REMAINING_VERSES=3
REMAINING_ADDED=0
while [ $VERSE_INDEX -lt $VERSE_COUNT ] && [ $REMAINING_ADDED -lt $MAX_REMAINING_VERSES ]; do
    write_verse_slide $VERSE_INDEX
    VERSE_INDEX=$((VERSE_INDEX + 1))
    REMAINING_ADDED=$((REMAINING_ADDED + 1))
done

# Close JSON
cat >> "$OUTPUT_FILE" << 'EOF'
  ]
}
EOF

echo ""
echo "Generated presentation.json with $SLIDE_COUNT slides"
echo "  - Photos: $TOTAL_PHOTOS"
echo "  - Verses: $VERSE_INDEX"
echo ""
echo "To start the slideshow, open index.html in a browser."
