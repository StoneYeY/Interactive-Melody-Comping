/**
 * keyboardInput.js
 * Handles keyboard input and maps it to piano roll - Default recording mode version
 */

class KeyboardInput {
    constructor(pianoVisual, audioEngine) {
        this.pianoVisual = pianoVisual;
        this.audioEngine = audioEngine;
        this.isEnabled = true;
        this.pressedKeys = new Set(); // Track pressed keys
        this.currentOctave = 4; // Default octave
        this.sustainMode = false; // Sustain mode

        // 🆕 Recording mode related
        this.recordingMode = true; // 🎯 Recording mode enabled by default
        this.noteStartTimes = new Map(); // Track start time for each key
        this.pendingNotes = new Map(); // Notes waiting for duration updates

        // Keyboard mapping - Based on standard piano keyboard layout
        this.keyMap = {
            // White keys (one octave)
            'KeyA': { note: 'C', color: 'white' },
            'KeyS': { note: 'D', color: 'white' },
            'KeyD': { note: 'E', color: 'white' },
            'KeyF': { note: 'F', color: 'white' },
            'KeyG': { note: 'G', color: 'white' },
            'KeyH': { note: 'A', color: 'white' },
            'KeyJ': { note: 'B', color: 'white' },

            // Black keys
            'KeyW': { note: 'C#', color: 'black' },
            'KeyE': { note: 'D#', color: 'black' },
            'KeyT': { note: 'F#', color: 'black' },
            'KeyY': { note: 'G#', color: 'black' },
            'KeyU': { note: 'A#', color: 'black' },

            // Next octave white keys
            'KeyK': { note: 'C', octaveOffset: 1, color: 'white' },
            'KeyL': { note: 'D', octaveOffset: 1, color: 'white' },
            'Semicolon': { note: 'E', octaveOffset: 1, color: 'white' },

            // Next octave black keys
            'KeyI': { note: 'C#', octaveOffset: 1, color: 'black' },
            'KeyO': { note: 'D#', octaveOffset: 1, color: 'black' },

            // Lower octave notes (Z row)
            'KeyZ': { note: 'C', octaveOffset: -1, color: 'white' },
            'KeyX': { note: 'D', octaveOffset: -1, color: 'white' },
            'KeyC': { note: 'E', octaveOffset: -1, color: 'white' },
            'KeyV': { note: 'F', octaveOffset: -1, color: 'white' },
            'KeyB': { note: 'G', octaveOffset: -1, color: 'white' },
            'KeyN': { note: 'A', octaveOffset: -1, color: 'white' },
            'KeyM': { note: 'B', octaveOffset: -1, color: 'white' },

            // Lower octave black keys
            'KeyQ': { note: 'C#', octaveOffset: -1, color: 'black' },
            'Digit2': { note: 'D#', octaveOffset: -1, color: 'black' },
            'Digit4': { note: 'F#', octaveOffset: -1, color: 'black' },
            'Digit5': { note: 'G#', octaveOffset: -1, color: 'black' },
            'Digit6': { note: 'A#', octaveOffset: -1, color: 'black' }
        };

        // Control keys mapping
        this.controlKeys = {
            'ArrowLeft': () => this.changeOctave(-1),
            'ArrowRight': () => this.changeOctave(1),
            'Space': () => this.toggleSustainMode(),
            'Escape': () => this.stopAllNotes(),
            'Enter': () => this.addCurrentNotesToInput(),
            'Backspace': () => this.clearLastNote(),
            'KeyR': () => this.toggleRecordingMode(), // R key toggles recording mode
        };

        // Initialize
        this.init();
        this.createKeyboardGuide();
    }

    init() {
        // Bind keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Prevent default behavior like page scrolling
        document.addEventListener('keydown', (e) => {
            if (this.isEnabled && (this.keyMap[e.code] || this.controlKeys[e.code])) {
                e.preventDefault();
            }
        });

        // Stop all notes when window loses focus
        window.addEventListener('blur', () => {
            this.stopAllNotes();
        });

        console.log('🎹 Keyboard input initialized - Default recording mode enabled');
    }

    handleKeyDown(e) {
        if (!this.isEnabled) return;

        // Don't process piano keys if user is typing in an input field
        if (this.isTypingInInput(e.target)) return;

        const keyCode = e.code;

        // Handle control keys
        if (this.controlKeys[keyCode]) {
            e.preventDefault();
            this.controlKeys[keyCode]();
            return;
        }

        // Handle note keys
        if (this.keyMap[keyCode] && !this.pressedKeys.has(keyCode)) {
            e.preventDefault();
            this.pressedKeys.add(keyCode);
            this.playNote(keyCode);
        }
    }

    handleKeyUp(e) {
        if (!this.isEnabled) return;

        const keyCode = e.code;

        // Handle note key release
        if (this.keyMap[keyCode] && this.pressedKeys.has(keyCode)) {
            e.preventDefault();
            this.pressedKeys.delete(keyCode);

            if (!this.sustainMode) {
                this.stopNote(keyCode);
            }
        }
    }

    playNote(keyCode) {
        const mapping = this.keyMap[keyCode];
        if (!mapping) return;

        const octave = this.currentOctave + (mapping.octaveOffset || 0);
        const noteWithOctave = mapping.note + octave;
        const midiNote = this.noteToMidi(noteWithOctave);

        // 🆕 Record start time
        if (this.recordingMode) {
            this.noteStartTimes.set(keyCode, Date.now());
        }

        // Play audio
        if (this.audioEngine && this.audioEngine.piano_synth) {
            this.audioEngine.piano_synth.triggerAttack(noteWithOctave);
        }

        // Display on piano roll
        if (this.pianoVisual) {
            const color = this.getRandomColor();
            this.pianoVisual.noteOn(midiNote, color);
        }

        // 🆕 Add note to input (temporary duration)
        this.addNoteToUserInput(noteWithOctave, keyCode);

        // Display current playing note
        this.showCurrentNote(noteWithOctave);

        console.log(`🎹 Playing: ${noteWithOctave} (MIDI: ${midiNote})`);
    }

    stopNote(keyCode) {
        const mapping = this.keyMap[keyCode];
        if (!mapping) return;

        const octave = this.currentOctave + (mapping.octaveOffset || 0);
        const noteWithOctave = mapping.note + octave;
        const midiNote = this.noteToMidi(noteWithOctave);

        // 🆕 Recording mode: calculate actual duration and update
        if (this.recordingMode && this.noteStartTimes.has(keyCode)) {
            const actualDuration = this.calculateActualDuration(keyCode);
            this.updateNoteWithActualDuration(keyCode, actualDuration);
            this.noteStartTimes.delete(keyCode);
        }

        // Stop audio
        if (this.audioEngine && this.audioEngine.piano_synth) {
            this.audioEngine.piano_synth.triggerRelease(noteWithOctave);
        }

        // Release on piano roll
        if (this.pianoVisual) {
            this.pianoVisual.noteOff(midiNote);
        }

        console.log(`🎹 Stopped: ${noteWithOctave}`);
    }

    // 🆕 Calculate actual duration (based on key press time)
    calculateActualDuration(keyCode) {
        const startTime = this.noteStartTimes.get(keyCode);
        if (!startTime) return 4; // Default 4 sixteenth notes

        const pressDurationMs = Date.now() - startTime;
        const pressDurationSeconds = pressDurationMs / 1000;

        // Convert seconds to sixteenth note count (120 BPM = 0.125s per sixteenth note)
        const sixteenthNoteLength = 0.125;
        const calculatedDuration = Math.max(1, Math.round(pressDurationSeconds / sixteenthNoteLength));

        console.log(`⏱️ Key press duration: ${pressDurationMs}ms → ${calculatedDuration} sixteenth notes`);
        return calculatedDuration;
    }

    // 🆕 Add note to input (supports recording mode)
    addNoteToUserInput(noteWithOctave, keyCode) {
        const userInput = document.getElementById('userInput');
        if (!userInput) return;

        if (userInput.value && !userInput.value.endsWith(' ')) {
            userInput.value += ' ';
        }

        if (this.recordingMode) {
            // Recording mode: add temporary duration first, update when key released
            const tempDuration = 4; // Temporary default
            userInput.value += `${noteWithOctave}:${tempDuration}`;

            // Record this note's position in input for later update
            this.pendingNotes.set(keyCode, {
                note: noteWithOctave,
                inputPosition: this.getLastNotePosition(userInput.value)
            });
        } else {
            // Non-recording mode: use default duration
            userInput.value += `${noteWithOctave}:4`;
        }
    }

    // 🆕 Get last note's position in input
    getLastNotePosition(inputValue) {
        const parts = inputValue.trim().split(' ');
        return parts.length - 1;
    }

    // 🆕 Update note with actual duration
    updateNoteWithActualDuration(keyCode, actualDuration) {
        const userInput = document.getElementById('userInput');
        if (!userInput || !this.pendingNotes.has(keyCode)) return;

        const noteInfo = this.pendingNotes.get(keyCode);
        const parts = userInput.value.trim().split(' ');

        if (parts.length > noteInfo.inputPosition) {
            // Update note duration at corresponding position
            const notePart = parts[noteInfo.inputPosition];
            const colonIndex = notePart.indexOf(':');

            if (colonIndex !== -1) {
                const noteName = notePart.substring(0, colonIndex);
                parts[noteInfo.inputPosition] = `${noteName}:${actualDuration}`;
                userInput.value = parts.join(' ');

                console.log(`✅ Updated note duration: ${noteName} → ${actualDuration} sixteenth notes`);
            }
        }

        this.pendingNotes.delete(keyCode);
    }

    // 🆕 Toggle recording mode
    toggleRecordingMode() {
        this.recordingMode = !this.recordingMode;
        this.updateRecordingDisplay();

        if (this.recordingMode) {
            console.log('🔴 Recording mode enabled - Key press duration will be converted to note duration');
        } else {
            console.log('⚪ Recording mode disabled - Using fixed durations');
        }
    }

    stopAllNotes() {
        // Stop all currently playing notes
        for (const keyCode of this.pressedKeys) {
            this.stopNote(keyCode);
        }
        this.pressedKeys.clear();

        // Clear recording related data
        this.noteStartTimes.clear();
        this.pendingNotes.clear();

        // Release all notes in audio engine
        if (this.audioEngine && this.audioEngine.piano_synth) {
            this.audioEngine.piano_synth.releaseAll();
        }

        console.log('🛑 Stopped all notes');
    }

    changeOctave(direction) {
        const newOctave = this.currentOctave + direction;
        if (newOctave >= 1 && newOctave <= 7) {
            this.currentOctave = newOctave;
            this.updateOctaveDisplay();
            console.log(`🎼 Switched to octave: ${this.currentOctave}`);
        }
    }

    toggleSustainMode() {
        this.sustainMode = !this.sustainMode;
        this.updateSustainDisplay();

        if (!this.sustainMode) {
            // If turning off sustain, release all notes
            this.stopAllNotes();
        }

        console.log(`🎹 Sustain mode: ${this.sustainMode ? 'ON' : 'OFF'}`);
    }

    addCurrentNotesToInput() {
        // Add all currently pressed notes as a chord
        const currentNotes = [];
        for (const keyCode of this.pressedKeys) {
            const mapping = this.keyMap[keyCode];
            if (mapping) {
                const octave = this.currentOctave + (mapping.octaveOffset || 0);
                currentNotes.push(mapping.note + octave);
            }
        }

        if (currentNotes.length > 0) {
            const userInput = document.getElementById('userInput');
            if (userInput) {
                if (userInput.value && !userInput.value.endsWith(' ')) {
                    userInput.value += ' ';
                }
                userInput.value += '[' + currentNotes.join(' ') + ']';
            }
        }
    }

    clearLastNote() {
        const userInput = document.getElementById('userInput');
        if (userInput && userInput.value) {
            const parts = userInput.value.trim().split(' ');
            parts.pop();
            userInput.value = parts.join(' ');
        }
    }

    // Helper functions
    noteToMidi(note) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const match = note.match(/([A-G][#b]?)(\d+)/);
        if (!match) return 60;

        const noteName = match[1];
        const octave = parseInt(match[2]);
        const noteIndex = noteNames.indexOf(noteName);

        if (noteIndex === -1) return 60;
        return 12 * (octave + 1) + noteIndex;
    }

    getRandomColor() {
        const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    isTypingInInput(element) {
        return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.contentEditable === 'true';
    }

    showCurrentNote(note) {
        const indicator = document.getElementById('currentNoteIndicator');
        if (indicator) {
            indicator.textContent = `Current note: ${note}`;
            indicator.style.opacity = '1';

            setTimeout(() => {
                indicator.style.opacity = '0.5';
            }, 200);
        }
    }

    updateOctaveDisplay() {
        const display = document.getElementById('octaveDisplay');
        if (display) {
            display.textContent = `Octave: ${this.currentOctave}`;
        }
    }

    updateSustainDisplay() {
        const display = document.getElementById('sustainDisplay');
        if (display) {
            display.textContent = `Sustain: ${this.sustainMode ? 'ON' : 'OFF'}`;
            display.style.color = this.sustainMode ? '#4CAF50' : '#666';
        }
    }

    // 🆕 Update recording mode display
    updateRecordingDisplay() {
        const display = document.getElementById('recordingDisplay');
        if (display) {
            display.textContent = `Recording: ${this.recordingMode ? 'ON' : 'OFF'}`;
            display.style.color = this.recordingMode ? '#ff6b6b' : '#666';
            display.style.fontWeight = this.recordingMode ? 'bold' : 'normal';
        }
    }

    // Create keyboard guide
    createKeyboardGuide() {
        const guide = document.createElement('div');
        guide.id = 'keyboardGuide';
        guide.className = 'keyboard-guide';
        guide.innerHTML = `
            <div class="guide-header">
                <h4>🎹 Recording Mode Keyboard Controls</h4>
                <button id="toggleGuide" class="toggle-btn">Hide</button>
            </div>
            <div class="guide-content" id="guideContent">
                <div class="guide-section">
                    <h5>🎵 Note Input:</h5>
                    <div class="key-layout">
                        <div class="keyboard-row">
                            <span class="black-key">W</span>
                            <span class="black-key">E</span>
                            <span class="spacer"></span>
                            <span class="black-key">T</span>
                            <span class="black-key">Y</span>
                            <span class="black-key">U</span>
                        </div>
                        <div class="keyboard-row">
                            <span class="white-key">A</span>
                            <span class="white-key">S</span>
                            <span class="white-key">D</span>
                            <span class="white-key">F</span>
                            <span class="white-key">G</span>
                            <span class="white-key">H</span>
                            <span class="white-key">J</span>
                        </div>
                        <div class="note-names">
                            <span>C</span>
                            <span>D</span>
                            <span>E</span>
                            <span>F</span>
                            <span>G</span>
                            <span>A</span>
                            <span>B</span>
                        </div>
                    </div>
                </div>
                <div class="guide-section">
                    <h5>⏱️ Recording Mode Features:</h5>
                    <ul>
                        <li><strong>Key press duration = Note duration</strong></li>
                        <li>Short press → Short note (1-2 sixteenth notes)</li>
                        <li>Long press → Long note (8+ sixteenth notes)</li>
                        <li>Automatically calculates and updates duration on key release</li>
                        <li>Press <kbd>R</kbd> to toggle recording mode</li>
                    </ul>
                </div>
                <div class="guide-section">
                    <h5>🎮 Control Keys:</h5>
                    <ul>
                        <li><kbd>←/→</kbd> - Change octave</li>
                        <li><kbd>Space</kbd> - Toggle sustain mode</li>
                        <li><kbd>R</kbd> - Toggle recording mode</li>
                        <li><kbd>Enter</kbd> - Add chord to input</li>
                        <li><kbd>Backspace</kbd> - Delete last note</li>
                        <li><kbd>Esc</kbd> - Stop all notes</li>
                    </ul>
                </div>
                <div class="guide-section">
                    <h5>📊 Status Indicators:</h5>
                    <div class="status-indicators">
                        <span id="octaveDisplay">Octave: 4</span>
                        <span id="sustainDisplay">Sustain: OFF</span>
                        <span id="recordingDisplay">Recording: ON</span>
                        <span id="currentNoteIndicator">Current note: -</span>
                    </div>
                </div>
                <div class="guide-section">
                    <h5>💡 Input Format:</h5>
                    <p>Auto-generated format: <code>note:duration</code></p>
                    <p>Example: <code>C4:2 D4:8 E4:4</code></p>
                    <p class="highlight">⚡ Recording mode enabled by default!</p>
                </div>
            </div>
        `;

        // Add to page
        document.body.appendChild(guide);

        // Add toggle show/hide functionality
        document.getElementById('toggleGuide').addEventListener('click', function() {
            const content = document.getElementById('guideContent');
            const button = this;

            if (content.style.display === 'none') {
                content.style.display = 'block';
                button.textContent = 'Hide';
            } else {
                content.style.display = 'none';
                button.textContent = 'Show';
            }
        });

        // Initialize displays
        this.updateOctaveDisplay();
        this.updateSustainDisplay();
        this.updateRecordingDisplay(); // 🆕 Show recording status
    }

    // Enable/disable keyboard input
    enable() {
        this.isEnabled = true;
        console.log('🎹 Keyboard input enabled');
    }

    disable() {
        this.isEnabled = false;
        this.stopAllNotes();
        console.log('🎹 Keyboard input disabled');
    }

    // Clean up resources
    destroy() {
        this.stopAllNotes();
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);

        const guide = document.getElementById('keyboardGuide');
        if (guide) {
            guide.remove();
        }

        console.log('🎹 Keyboard input destroyed');
    }
}
// =============================================================================
// 🤖 KeyboardInput Auto Chord Generation Extension
// Added at the end of keyboardInput.js
// =============================================================================

/**
 * Adds auto chord generation functionality to KeyboardInput class
 * When user stops playing for 2 seconds, automatically generates chords and plays them
 */

// Extend KeyboardInput prototype with auto-generation
KeyboardInput.prototype.initAutoGeneration = function() {
    console.log('🤖 Initializing KeyboardInput auto-generation...');

    // Auto-generation properties
    this.autoGenerationEnabled = true;
    this.autoGenerationTimer = null;
    this.autoGenerationDelay = 1000; // 2 second delay

    // Backup original methods
    this._originalAddNoteToUserInput = this.addNoteToUserInput;
    this._originalUpdateNoteWithActualDuration = this.updateNoteWithActualDuration;
    this._originalStopAllNotes = this.stopAllNotes;

    // Enhanced addNoteToUserInput method
    this.addNoteToUserInput = function(noteWithOctave, keyCode) {
        // Call original method
        this._originalAddNoteToUserInput(noteWithOctave, keyCode);

        // Trigger auto-generation logic
        this.triggerAutoGeneration(`Keyboard input note: ${noteWithOctave}`);
    };

    // Enhanced updateNoteWithActualDuration method (recording mode)
    this.updateNoteWithActualDuration = function(keyCode, actualDuration) {
        // Call original method
        this._originalUpdateNoteWithActualDuration(keyCode, actualDuration);

        // Re-trigger auto-generation
        this.triggerAutoGeneration('Note duration updated');
    };

    // Enhanced stopAllNotes method
    this.stopAllNotes = function() {
        // Call original method
        this._originalStopAllNotes();

        // Stop auto-generation timer
        this.stopAutoGeneration();
    };

    console.log('✅ KeyboardInput auto-generation initialized');
};

// Core auto-generation trigger method
KeyboardInput.prototype.triggerAutoGeneration = function(reason) {
    if (!this.autoGenerationEnabled) return;

    console.log(`🎹 ${reason}, preparing auto-generation`);

    // Clear previous timer
    if (this.autoGenerationTimer) {
        clearTimeout(this.autoGenerationTimer);
        console.log('⏰ Cleared previous auto-generation timer');
    }

    // Set new auto-generation timer
    this.autoGenerationTimer = setTimeout(async () => {
        const userInput = document.getElementById('userInput');
        if (userInput && userInput.value.trim()) {
            const inputValue = userInput.value.trim();
            console.log('🚀 Auto-generating chords after 2 seconds:', inputValue);

            try {
                // Show generation status
                this.showGenerationStatus('🎹 Generating...');

                // Trigger input event to start existing generation logic
                const inputEvent = new Event('input', { bubbles: true });
                userInput.dispatchEvent(inputEvent);

                console.log('✅ Auto-generation triggered successfully');

            } catch (error) {
                console.error('❌ Keyboard input auto-generation failed:', error);
                this.showGenerationStatus(`❌ Generation failed: ${error.message}`, 'error');
            }
        } else {
            console.log('📝 Input empty, skipping auto-generation');
        }
    }, this.autoGenerationDelay);

    console.log(`⏰ Set ${this.autoGenerationDelay/1000} second auto-generation timer`);
};

// Show generation status
KeyboardInput.prototype.showGenerationStatus = function(message, type = 'info') {
    const responseContent = document.getElementById('responseContent');
    if (responseContent) {
        if (type === 'error') {
            responseContent.innerHTML = `<p style="color:red;">${message}</p>`;
        } else {
            responseContent.innerHTML = `<p>${message}</p>`;
            responseContent.classList.add('loading-response');
        }
    }
};

// Stop auto-generation
KeyboardInput.prototype.stopAutoGeneration = function() {
    if (this.autoGenerationTimer) {
        clearTimeout(this.autoGenerationTimer);
        this.autoGenerationTimer = null;
        console.log('🛑 Stopped auto-generation timer');
    }
};

// Set auto-generation delay
KeyboardInput.prototype.setAutoGenerationDelay = function(delayMs) {
    this.autoGenerationDelay = delayMs;
    console.log(`⏰ Set auto-generation delay to: ${delayMs}ms`);
};

// Enable/disable auto-generation
KeyboardInput.prototype.toggleAutoGeneration = function() {
    this.autoGenerationEnabled = !this.autoGenerationEnabled;
    if (!this.autoGenerationEnabled) {
        this.stopAutoGeneration();
    }
    console.log(`🤖 Auto-generation: ${this.autoGenerationEnabled ? 'Enabled' : 'Disabled'}`);
    return this.autoGenerationEnabled;
};

// Update keyboard guide with auto-generation instructions
KeyboardInput.prototype.updateKeyboardGuideWithAutoGeneration = function() {
    const guideContent = document.getElementById('guideContent');
    if (!guideContent) return;

    // Check if already added
    if (document.getElementById('autoGenerationSection')) return;

    const autoGenSection = document.createElement('div');
    autoGenSection.id = 'autoGenerationSection';
    autoGenSection.className = 'guide-section';
    autoGenSection.innerHTML = `
        <h5>🤖 Auto Chord Generation:</h5>
        <ul>
            <li><strong>After stopping playing for 2s → Auto-generate chords</strong></li>
            <li>No manual trigger needed, system detects input stop</li>
            <li>Plays chords + melody after generation</li>
            <li>Supports recording mode's precise durations</li>
            <li>Press <kbd>Ctrl+G</kbd> to toggle auto-generation</li>
        </ul>
        <div class="highlight" style="background: #e8f5e8; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 4px solid #4CAF50;">
            ⚡ <strong>Auto-generation enabled!</strong><br>
            Now play notes with keyboard, chords will auto-generate after 2s
        </div>
        <div class="status-line" style="margin-top: 8px; font-size: 0.9em; color: #666;">
            <span id="autoGenStatus">Status: Enabled</span> | 
            <span id="autoGenDelay">Delay: 2.0s</span>
        </div>
    `;

    guideContent.appendChild(autoGenSection);

    // Add shortcut support
    this.addAutoGenerationShortcuts();
};

// Add auto-generation shortcuts
KeyboardInput.prototype.addAutoGenerationShortcuts = function() {
    // Avoid duplicate additions
    if (this._autoGenShortcutsAdded) return;
    this._autoGenShortcutsAdded = true;

    document.addEventListener('keydown', (e) => {
        // Ctrl+G: Toggle auto-generation
        if (e.ctrlKey && e.code === 'KeyG' && !this.isTypingInInput(e.target)) {
            e.preventDefault();
            const enabled = this.toggleAutoGeneration();

            // Update status display
            const statusElement = document.getElementById('autoGenStatus');
            if (statusElement) {
                statusElement.textContent = `Status: ${enabled ? 'Enabled' : 'Disabled'}`;
                statusElement.style.color = enabled ? '#4CAF50' : '#f44336';
            }

            // Show notification
            this.showCurrentNote(`Auto-gen: ${enabled ? 'ON' : 'OFF'}`);
        }
    });
};

// Automatically initialize when KeyboardInput instance is created
// Modify constructor or use the auto-initialization code below

// =============================================================================
// 🚀 Auto-initialization code - Automatically enhances existing KeyboardInput instances when page loads
// =============================================================================

// Check and enhance existing KeyboardInput instances
function autoEnhanceKeyboardInput() {
    console.log('🔍 Checking if KeyboardInput needs enhancement...');

    // Wait for keyboardInput instance creation
    const checkInterval = setInterval(() => {
        if (typeof keyboardInput !== 'undefined' && keyboardInput && !keyboardInput.autoGenerationEnabled) {
            console.log('✅ Found KeyboardInput instance, enhancing...');

            // Initialize auto-generation
            keyboardInput.initAutoGeneration();

            // Update keyboard guide
            setTimeout(() => {
                keyboardInput.updateKeyboardGuideWithAutoGeneration();
            }, 1000);

            console.log('🎉 KeyboardInput auto-generation enabled!');
            console.log('');
            console.log('📖 Usage:');
            console.log('1. 🎹 Play notes with keyboard (A=C, S=D, D=E, F=F, G=G, H=A, J=B)');
            console.log('2. ⏰ Stop playing, wait 2 seconds');
            console.log('3. 🎵 System auto-generates chords and plays them');
            console.log('4. 🎮 Ctrl+G to toggle auto-generation');
            console.log('');

            clearInterval(checkInterval);
        }
    }, 500);

    // Stop checking after 10 seconds
    setTimeout(() => {
        clearInterval(checkInterval);
    }, 10000);
}

// If page already loaded, execute immediately
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoEnhanceKeyboardInput);
} else {
    autoEnhanceKeyboardInput();
}

// =============================================================================
// 🛠️ Debugging and Testing Tools
// =============================================================================

// Add global test function
window.testKeyboardAutoGeneration = function() {
    console.log('🧪 Testing KeyboardInput auto-generation...');

    if (!keyboardInput || !keyboardInput.autoGenerationEnabled) {
        console.error('❌ KeyboardInput auto-generation not enabled');
        return;
    }

    console.log('📊 Current status:');
    console.log('- Auto-generation:', keyboardInput.autoGenerationEnabled);
    console.log('- Auto-generation delay:', keyboardInput.autoGenerationDelay + 'ms');
    console.log('- Recording mode:', keyboardInput.recordingMode);
    console.log('- Current octave:', keyboardInput.currentOctave);

    console.log('');
    console.log('🎹 Starting simulated keyboard input test...');

    // Simulate key presses
    ['KeyA', 'KeyS', 'KeyD'].forEach((keyCode, index) => {
        setTimeout(() => {
            console.log(`🎹 Simulating press: ${keyCode}`);
            keyboardInput.handleKeyDown({
                code: keyCode,
                preventDefault: () => {},
                target: document.body // Ensure not in input field
            });

            setTimeout(() => {
                keyboardInput.handleKeyUp({
                    code: keyCode,
                    preventDefault: () => {}
                });
            }, 400);
        }, index * 600);
    });

    console.log('⏰ Test complete, should auto-generate chords after 2 seconds...');
};

// Add quick setup function
window.setAutoGenDelay = function(seconds) {
    if (keyboardInput) {
        keyboardInput.setAutoGenerationDelay(seconds * 1000);

        // Update display
        const delayElement = document.getElementById('autoGenDelay');
        if (delayElement) {
            delayElement.textContent = `Delay: ${seconds}s`;
        }
    }
};

console.log('🎹 KeyboardInput auto-generation extension loaded');
console.log('🛠️ Debug commands: testKeyboardAutoGeneration()');
console.log('🛠️ Set delay: setAutoGenDelay(1.5) // 1.5 seconds');
console.log('🛠️ Shortcut: Ctrl+G to toggle auto-generation');
// Export class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyboardInput;
}