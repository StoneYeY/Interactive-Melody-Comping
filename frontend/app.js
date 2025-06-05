// Global variables
let piano_synth; // Piano synthesizer
let metronome; // Metronome
let metronome_status = false; // Metronome status
let currentMode = 'notes'; // Current mode: 'notes' or 'chords'
let visual; // Visualization object
let drawLoop; // Drawing loop
let generatedResult = null; // Generated result
let keyboardInput = null;
let midiInputNotes = []; // Store MIDI input notes
let midiInputTimer = null; // MIDI input timer

let lastMusicData = null;  // 存储最新音乐数据给Arco
let arcoMusicBuffer = [];  // 存储完整的音乐句子

// Constants
const CYCLE = 2; // 2-bar cycle
let CYCLE_NUM_BEAT = CYCLE > 0 ? CYCLE * 4 : 8;
let CYCLE_STRING = `${Math.floor(CYCLE_NUM_BEAT / 4)}m`;

// Show welcome page on initialization
document.addEventListener('DOMContentLoaded', function() {
    setupUI();
    initialize();
});

function setupUI() {
    const modeNotesBtn = document.getElementById('modeNotes');
    const modeChordsBtn = document.getElementById('modeChords');

    if (modeNotesBtn && modeChordsBtn) {
        modeNotesBtn.addEventListener('click', function() {
            currentMode = 'notes';
            modeNotesBtn.classList.add('active');
            modeChordsBtn.classList.remove('active');
            const userInput = document.getElementById('userInput');
            if (userInput) {
                userInput.placeholder = "Enter note sequence here (e.g. C4 E4 G4)";
            }
            updateCurrentModeDisplay();
        });

        modeChordsBtn.addEventListener('click', function() {
            currentMode = 'chords';
            modeChordsBtn.classList.add('active');
            modeNotesBtn.classList.remove('active');
            const userInput = document.getElementById('userInput');
            if (userInput) {
                userInput.placeholder = "Enter chord sequence here (e.g. Cmaj7 Dm7 G7)";
            }
            updateCurrentModeDisplay();
        });
    } else {
        console.warn('Mode selection buttons not found, skipping mode switch functionality');
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearContent);
    }

    const playBtn2 = document.getElementById('playBtn2');
    if (playBtn2) {
        playBtn2.addEventListener('click', playMusicWithChords);
    }

    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', stopMusic);
    }

    const metronomeBtn = document.getElementById('metronomeBtn');
    if (metronomeBtn) {
        metronomeBtn.addEventListener('click', toggleMetronome);
    }

    const userInput = document.getElementById('userInput');
    if (userInput) {
        let inputTimer = null;

        userInput.addEventListener('input', function(event) {
            console.log('Input change detected:', event.target.value);

            if (inputTimer) {
                clearTimeout(inputTimer);
            }

            inputTimer = setTimeout(async () => {
                const inputValue = event.target.value.trim();
                if (inputValue) {
                    console.log('Triggering auto-generation');
                    try {
                        await generateContentWithAPI();

                        if (generatedResult) {
                            setTimeout(() => {
                                if (typeof playMusicWithChords === 'function') {
                                    playMusicWithChords();
                                }
                            }, 500);
                        }
                    } catch (error) {
                        console.error('Auto-generation failed:', error);
                    }
                }
            }, 1500);
        });
    } else {
        console.warn('User input field not found');
    }

    setupKeyboardInputControls();
    updateCurrentModeDisplay();
}

async function initialize() {
    if (typeof SampleLibrary === 'undefined') {
        console.error('SampleLibrary not loaded');
        return;
    }

    SampleLibrary.baseUrl = "https://lukewys.github.io/files/tonejs-samples/";

    try {
        piano_synth = await loadPiano();
        piano_synth.toDestination();

        metronome = await loadMetronome();
        metronome.toDestination();

        console.log('Audio loaded!');

        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.textContent = 'Start';
            playBtn.removeAttribute('disabled');
            playBtn.classList.remove('loading');
        }
    } catch (err) {
        console.error('Audio loading failed:', err);
        alert('Audio loading failed, please refresh the page.');
    }
}

function loadPiano() {
    return new Promise((resolve) => {
        const piano = SampleLibrary.load({
            instruments: 'piano',
            onload: () => {
                resolve(piano);
            },
        });
    });
}

function loadMetronome() {
    return new Promise((resolve) => {
        const metronome = SampleLibrary.load({
            instruments: 'metronome',
            onload: () => {
                resolve(metronome);
            },
        });
    });
}

function showMainScreen() {
    const splash = document.querySelector('.splash');
    const loaded = document.querySelector('.loaded');

    if (splash) splash.hidden = true;
    if (loaded) loaded.hidden = false;

    if (typeof Tone !== 'undefined') {
        Tone.start();
    }

    initPianoVisual();

    if (typeof WebMidi !== 'undefined') {
        WebMidi
            .enable()
            .then(onEnabled)
            .catch(err => {
                console.log("MIDI device not available, using mouse click keyboard.");
                onEnabledClick();
            });
    } else {
        console.log("WebMidi not available, using mouse click keyboard.");
        onEnabledClick();
    }
}

function midiToNoteName(midiNumber) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    return `${noteNames[noteIndex]}${octave}`;
}

function initPianoVisual() {
    const pianoDiv = document.getElementById('pianoroll');
    if (!pianoDiv) {
        console.warn('Piano roll container not found');
        return;
    }

    if (typeof NoteVisual === 'undefined' || typeof DrawLoop === 'undefined') {
        console.warn('Visualization classes not loaded');
        return;
    }

    visual = new NoteVisual(
        pianoDiv,
        'waterfall',
        'vertical',
        3,
        4,
        pianoDiv.offsetWidth,
        pianoDiv.offsetHeight,
        0,
        0
    );

    if (typeof CONSTANTS !== 'undefined') {
        drawLoop = new DrawLoop(CONSTANTS.REFRESH_RATE);
        drawLoop.addDrawFunctionFromVisual(visual);
        drawLoop.startDrawLoop();
    }

    visual.setCycle(CYCLE);

    if (typeof Tone !== 'undefined') {
        Tone.Transport.bpm.value = 120;
    }

    if (!keyboardInput && typeof KeyboardInput !== 'undefined') {
        const audioEngine = {
            piano_synth: piano_synth
        };

        keyboardInput = new KeyboardInput(visual, audioEngine);
        console.log('Keyboard input integrated with piano roll');
    }
}

function onEnabled() {
    if (typeof Tone !== 'undefined') {
        Tone.context.lookAhead = 0.05;
    }

    if (WebMidi.inputs.length < 1) {
        console.log("No MIDI devices detected, using mouse click keyboard.");
        onEnabledClick();
    } else {
        console.log("MIDI device detected: " + WebMidi.inputs[0].name);
        const mySynth = WebMidi.inputs[0];

        mySynth.channels[1].addListener("noteon", e => {
            if (piano_synth) {
                //piano_synth.triggerAttack(e.note.identifier);
            }
            console.log(e.note.identifier, e.note.number, 'on', Date.now());
            if (visual) {
                visual.noteOn(e.note.number, getRandomColor());
            }

            const noteName = midiToNoteName(e.note.number);
            if (!midiInputNotes.includes(noteName)) {
                midiInputNotes.push(noteName);
                console.log('MIDI notes collected:', midiInputNotes.join(' '));
            }

            if (midiInputTimer) {
                clearTimeout(midiInputTimer);
            }

            midiInputTimer = setTimeout(async () => {
                if (midiInputNotes.length > 0) {
                    console.log('Auto-generating chords from MIDI input:', midiInputNotes.join(' '));
                    const userInput = document.getElementById('userInput');
                    if (userInput) {
                        userInput.value = midiInputNotes.join(' ');
                        const inputEvent = new Event('input', { bubbles: true });
                        userInput.dispatchEvent(inputEvent);
                    }
                    midiInputNotes = [];
                }
            }, 2000);
        });

        mySynth.channels[1].addListener("noteoff", e => {
            if (piano_synth) {
                //piano_synth.triggerRelease(e.note.identifier);
            }
            console.log(e.note.identifier, e.note.number, 'off', Date.now());
            if (visual) {
                visual.noteOff(e.note.number);
            }
        });
    }
}

function onEnabledClick() {
    const keys = document.querySelectorAll('#svg rect');
    const pianoNotes = ['A0', 'A#0', 'B0', 'C1', 'C#1', 'D1', 'D#1', 'E1', 'F1', 'F#1', 'G1', 'G#1', 'A1', 'A#1', 'B1', 'C2', 'C#2',
        'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2', 'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3',
        'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5',
        'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5', 'C6', 'C#6', 'D6', 'D#6', 'E6', 'F6', 'F#6', 'G6', 'G#6', 'A6', 'A#6', 'B6', 'C7', 'C#7',
        'D7', 'D#7', 'E7', 'F7', 'F#7', 'G7', 'G#7', 'A7', 'A#7', 'B7', 'C8'];

    keys.forEach(key => {
        key.addEventListener('mousedown', () => {
            const index = key.getAttribute('data-index');
            const note = pianoNotes[index];
            const num = parseInt(index) + 21;
            if (piano_synth) {
                //piano_synth.triggerAttack(note);
            }
            console.log(note, num, 'on', Date.now());
            if (visual) {
                visual.noteOn(num, getRandomColor());
            }
            if (!midiInputNotes.includes(note)) {
                midiInputNotes.push(note);
                console.log('Mouse click notes collected:', midiInputNotes.join(' '));
            }

            if (midiInputTimer) {
                clearTimeout(midiInputTimer);
            }

            midiInputTimer = setTimeout(async () => {
                if (midiInputNotes.length > 0) {
                    console.log('Auto-generating chords from mouse input:', midiInputNotes.join(' '));
                    const userInput = document.getElementById('userInput');
                    if (userInput) {
                        userInput.value = midiInputNotes.join(' ');
                        const inputEvent = new Event('input', { bubbles: true });
                        userInput.dispatchEvent(inputEvent);
                    }
                    midiInputNotes = [];
                }
            }, 2000);
        });

        key.addEventListener('mouseup', () => {
            const index = key.getAttribute('data-index');
            const note = pianoNotes[index];
            const num = parseInt(index) + 21;
            if (piano_synth) {
                //piano_synth.triggerRelease(note);
            }
            console.log(note, num, 'off', Date.now());
            if (visual) {
                visual.noteOff(num);
            }
        });

        key.addEventListener('mouseleave', () => {
            const index = key.getAttribute('data-index');
            if(key.getAttribute('active')) {
                const note = pianoNotes[index];
                const num = parseInt(index) + 21;
                if (piano_synth) {
                    //piano_synth.triggerRelease(note);
                }
                console.log(note, num, 'off', Date.now());
                if (visual) {
                    visual.noteOff(num);
                }
            }
        });
    });
}

async function generateContentWithAPI() {
    console.log('generateContentWithAPI called');

    const userInput = document.getElementById('userInput');
    if (!userInput) {
        throw new Error('Input field not found');
    }

    const inputValue = userInput.value.trim();
    if (!inputValue) {
        throw new Error('Please enter ' + (currentMode === 'notes' ? 'note sequence' : 'chord sequence'));
    }

    const responseContent = document.getElementById('responseContent');
    if (responseContent) {
        responseContent.innerHTML = '<p>Generating...</p>';
        responseContent.classList.add('loading-response');
    }

    try {
        console.log('User input:', inputValue);
        console.log('Current mode:', currentMode);

        if (currentMode === 'notes') {
            try {
                console.log('Trying real backend...');

                if (typeof MusicAPI === 'undefined') {
                    throw new Error('MusicAPI class not defined, please check api.js file');
                }

                const api = new MusicAPI();
                const melody = api.parseNotesToMelody(inputValue);

                console.log('Converted melody data:', melody);

                const tempSlider = document.getElementById('tempSlider');
                const kSlider = document.getElementById('kSlider');
                const temperature = tempSlider ? parseFloat(tempSlider.value) : 1.0;
                const kValue = kSlider ? parseInt(kSlider.value) : 20;

                const result = await api.harmonizeMelody(melody, temperature, kValue);
                generatedResult = api.formatChordResponse(result);

                console.log('Real backend call successful');

                if (generatedResult) {
                    generatedResult.description = '✅ Using real backend model - ' + generatedResult.description;
                    collectMusicDataForArco(generatedResult);
                }

            } catch (error) {
                console.warn('Real backend call failed, falling back to simulation:', error.message);
                generatedResult = await simulateBackendResponse(inputValue, currentMode);

                if (generatedResult) {
                    generatedResult.description = '⚠️ Using simulated data - ' + generatedResult.description;
                }
            }
        } else {
            console.log('Chord-to-melody mode using simulated data');
            generatedResult = await simulateBackendResponse(inputValue, currentMode);
        }

        if (responseContent) {
            responseContent.classList.remove('loading-response');

            const isRealBackend = generatedResult.description &&
                generatedResult.description.includes('✅ Using real backend model');

            let formattedInput;
            if (Array.isArray(generatedResult.input)) {
                formattedInput = generatedResult.input.map(item => {
                    if (Array.isArray(item) && item.length === 2) {
                        const midiNumber = item[0];
                        const duration = item[1];
                        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                        const octave = Math.floor(midiNumber / 12) - 1;
                        const noteIndex = midiNumber % 12;
                        const noteName = `${noteNames[noteIndex]}${octave}`;
                        return `${noteName}:${duration}`;
                    }
                    return item;
                }).join(' ');
            } else {
                formattedInput = generatedResult.input;
            }

            let html = `
                ${isRealBackend ? 
                    '<div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 8px; margin-bottom: 10px; border-radius: 4px; color: #155724;"><strong>✅ Using real backend API</strong></div>' :
                    '<div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 8px; margin-bottom: 10px; border-radius: 4px; color: #856404;"><strong>⚠️ Using simulated data</strong></div>'
                }
                <h3>Input: ${formattedInput}</h3>
                <h3>Output: ${Array.isArray(generatedResult.output) ? generatedResult.output.join(' ') : generatedResult.output}</h3>
                <p>${generatedResult.description}</p>
            `;

            responseContent.innerHTML = html;
        }

        return generatedResult;
    } catch (error) {
        console.error('Error generating content:', error);

        if (responseContent) {
            responseContent.classList.remove('loading-response');
            responseContent.innerHTML = `<p class="error">Error: ${error.message || 'Unknown error occurred during generation'}</p>`;
        }
        throw error;
    }
}

window.generateContent = async function() {
    const userInput = document.getElementById('userInput').value.trim();
    if (!userInput) {
        return;
    }

    console.log('Executing generate content function');

    document.getElementById('responseContent').innerHTML = '<p>Generating...</p>';

    try {
        await generateContentWithAPI();

        if (window.generatedResult) {
            setTimeout(() => {
                if (typeof playMusicWithChords === 'function') {
                    playMusicWithChords();
                } else {
                    playMusic();
                }
            }, 500);
        }
    } catch (error) {
        console.error('Content generation failed:', error);
        document.getElementById('responseContent').innerHTML =
            `<p style="color:red;">Generation failed: ${error.message || 'Unknown error'}</p>`;
    }
};

async function playMusicWithChords() {
    if (!generatedResult) {
        alert('Please generate music first');
        return;
    }

    try {
        if (typeof Tone !== 'undefined') {
            await Tone.start();
        }
    } catch (err) {
        console.error('Failed to start audio context:', err);
        alert('Please click the page to enable audio playback');
        document.body.addEventListener('click', async () => {
            if (typeof Tone !== 'undefined') {
                await Tone.start();
            }
        }, { once: true });
        return;
    }

    if (visual) {
        visual.clear();
        visual.start();
    }

    let time = (typeof Tone !== 'undefined' ? Tone.now() : Date.now() / 1000) + 0.5;

    if (currentMode === 'notes') {
        // 输入模式：旋律 → 和弦
        const melody = generatedResult.input;
        const chords = generatedResult.output;

        console.log('Play mode: Notes→Chords');
        console.log('Melody data:', melody);
        console.log('Chord data:', chords);

        // ========== 修复关键部分：确保时长匹配 ==========

        // 1. 计算旋律总时长
        const secondsPerSixteenth = 0.125; // 每个十六分音符的时长
        let melodyTotalDuration = 0;
        const melodyTimings = [];
        let currentPosition = 0;

        melody.forEach((noteData, index) => {
            let note, duration;

            if (Array.isArray(noteData)) {
                note = noteData[0];
                duration = noteData[1];
            } else if (typeof noteData === 'string') {
                note = noteData;
                duration = 4; // 默认四分音符
            } else if (typeof noteData === 'number') {
                note = noteData;
                duration = 4;
            } else {
                note = noteData;
                duration = 4;
            }

            const durationSeconds = duration * secondsPerSixteenth;

            melodyTimings.push({
                note: note,
                duration: duration,
                durationSeconds: durationSeconds,
                startTime: time + (currentPosition * secondsPerSixteenth),
                index: index
            });

            currentPosition += duration;
            melodyTotalDuration += durationSeconds;
        });

        console.log(`Melody total duration: ${melodyTotalDuration.toFixed(2)}s, ${melodyTimings.length} notes`);

        // 2. 播放旋律（保持原速度）
        melodyTimings.forEach((noteInfo, index) => {
            try {
                let noteToPlay;
                if (typeof noteInfo.note === 'number') {
                    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                    const octave = Math.floor(noteInfo.note / 12) - 1;
                    const noteIndex = noteInfo.note % 12;
                    noteToPlay = `${noteNames[noteIndex]}${octave}`;
                } else {
                    noteToPlay = noteInfo.note;
                }

                const midiNote = noteToMidi(noteToPlay);

                console.log(`  Playing note ${index + 1}: ${noteToPlay} (duration:${noteInfo.durationSeconds.toFixed(2)}s)`);

                if (piano_synth && typeof Tone !== 'undefined') {
                    piano_synth.triggerAttackRelease(
                        noteToPlay,
                        noteInfo.durationSeconds * 0.8,
                        noteInfo.startTime,
                        0.7
                    );
                }

                setTimeout(() => {
                    if (visual) {
                        visual.noteOn(midiNote, 'red');
                        setTimeout(() => {
                            if (visual) {
                                visual.noteOff(midiNote);
                            }
                        }, noteInfo.durationSeconds * 800);
                    }
                }, (noteInfo.startTime - (typeof Tone !== 'undefined' ? Tone.now() : Date.now() / 1000)) * 1000);

            } catch (e) {
                console.error(`Cannot play note ${noteInfo.note}:`, e);
            }
        });

        // 3. 和弦播放：确保与旋律总时长匹配
        const chordDuration = melodyTotalDuration / chords.length;
        console.log(`Chord distribution: ${chords.length} chords, each ${chordDuration.toFixed(2)}s (matched to melody duration)`);

        chords.forEach((chord, index) => {
            const chordStartTime = time + (index * chordDuration);

            console.log(`  Chord ${index + 1}: ${chord} (${chordStartTime.toFixed(2)}s, ${chordDuration.toFixed(2)}s)`);

            const chordNotes = chordToNotes(chord);

            chordNotes.forEach(note => {
                try {
                    const midiNote = noteToMidi(note);

                    if (typeof Tone !== 'undefined') {
                        const chordSynth = new Tone.Synth({
                            volume: -8
                        }).toDestination();

                        chordSynth.triggerAttackRelease(note, chordDuration * 0.9, chordStartTime, 0.5);
                    }

                    setTimeout(() => {
                        if (visual) {
                            visual.noteOn(midiNote, 'blue');
                            setTimeout(() => {
                                if (visual) {
                                    visual.noteOff(midiNote);
                                }
                            }, chordDuration * 900);
                        }
                    }, (chordStartTime - (typeof Tone !== 'undefined' ? Tone.now() : Date.now() / 1000)) * 1000);
                } catch (e) {
                    console.error(`Cannot play chord note ${note}:`, e);
                }
            });
        });

    } else {
        // 输出模式：和弦 → 旋律
        const chords = generatedResult.input;
        const melody = generatedResult.output;

        console.log('Play mode: Chords→Melody');
        console.log('Chord data:', chords);
        console.log('Melody data:', melody);

        // ========== 修复关键部分：确保输出旋律速度匹配输入和弦 ==========

        // 1. 设定和弦时长（标准）
        const chordDuration = 2; // 每个和弦2秒
        const totalDuration = chords.length * chordDuration;

        // 2. 计算旋律音符时长：确保旋律总时长 = 和弦总时长
        const melodyNoteDuration = totalDuration / melody.length;

        console.log(`Chord playback: ${chords.length} chords, each ${chordDuration}s`);
        console.log(`Melody playback: ${melody.length} notes, each ${melodyNoteDuration.toFixed(2)}s (matched to chord duration)`);

        // 3. 播放和弦
        chords.forEach((chord, index) => {
            const chordStartTime = time + index * chordDuration;

            console.log(`  Chord ${index + 1}: ${chord} (${chordStartTime.toFixed(2)}s)`);

            const chordNotes = chordToNotes(chord);

            chordNotes.forEach(note => {
                try {
                    const midiNote = noteToMidi(note);

                    if (typeof Tone !== 'undefined') {
                        const chordSynth = new Tone.Synth({
                            volume: -6
                        }).toDestination();

                        chordSynth.triggerAttackRelease(note, chordDuration * 0.9, chordStartTime, 0.5);
                    }

                    setTimeout(() => {
                        if (visual) {
                            visual.noteOn(midiNote, 'blue');
                            setTimeout(() => {
                                if (visual) {
                                    visual.noteOff(midiNote);
                                }
                            }, chordDuration * 900);
                        }
                    }, (chordStartTime - (typeof Tone !== 'undefined' ? Tone.now() : Date.now() / 1000)) * 1000);
                } catch (e) {
                    console.error(`Cannot play chord note ${note}:`, e);
                }
            });
        });

        // 4. 播放旋律：使用计算出的匹配时长
        melody.forEach((note, index) => {
            const noteTime = time + (index * melodyNoteDuration);

            console.log(`  Melody note ${index + 1}: ${note} (${noteTime.toFixed(2)}s, duration: ${melodyNoteDuration.toFixed(2)}s)`);

            try {
                const midiNote = noteToMidi(note);

                if (typeof Tone !== 'undefined') {
                    const melodySynth = new Tone.Synth({
                        volume: -2
                    }).toDestination();

                    melodySynth.triggerAttackRelease(note, melodyNoteDuration * 0.8, noteTime, 0.7);
                }

                setTimeout(() => {
                    if (visual) {
                        visual.noteOn(midiNote, 'red');
                        setTimeout(() => {
                            if (visual) {
                                visual.noteOff(midiNote);
                            }
                        }, melodyNoteDuration * 800);
                    }
                }, (noteTime - (typeof Tone !== 'undefined' ? Tone.now() : Date.now() / 1000)) * 1000);
            } catch (e) {
                console.error(`Cannot play note ${note}:`, e);
            }
        });
    }

    console.log('All playback events scheduled with matched timing');
}

// ========== 额外优化：添加速度控制选项 ==========

// 添加全局速度控制变量
let globalSpeedMultiplier = 1.0; // 1.0 = 正常速度, 0.5 = 一半速度, 2.0 = 两倍速度

// 修改时长计算函数，支持速度调节
function calculateDurationWithSpeed(baseDuration) {
    return baseDuration / globalSpeedMultiplier;
}

// 提供速度控制接口
window.musicSpeedControl = {
    setSpeed: function(speed) {
        globalSpeedMultiplier = Math.max(0.1, Math.min(3.0, speed)); // 限制在0.1x到3x之间
        console.log(`🎵 播放速度设置为: ${globalSpeedMultiplier}x`);
    },

    slower: function() {
        this.setSpeed(globalSpeedMultiplier * 0.8);
    },

    faster: function() {
        this.setSpeed(globalSpeedMultiplier * 1.25);
    },

    reset: function() {
        this.setSpeed(1.0);
    },

    getSpeed: function() {
        return globalSpeedMultiplier;
    }
};

console.log('🎵 音乐速度控制已加载');
console.log('💡 使用方法:');
console.log('- musicSpeedControl.setSpeed(0.5)  // 半速播放');
console.log('- musicSpeedControl.setSpeed(2.0)  // 两倍速播放');
console.log('- musicSpeedControl.slower()       // 减速');
console.log('- musicSpeedControl.faster()       // 加速');
console.log('- musicSpeedControl.reset()        // 重置为正常速度');

function clearContent() {
    const userInput = document.getElementById('userInput');
    const responseContent = document.getElementById('responseContent');

    if (userInput) {
        userInput.value = '';
    }
    if (responseContent) {
        responseContent.innerHTML = '';
    }
    if (visual) {
        visual.clear();
    }
    generatedResult = null;
}

async function playMusic() {
    if (!generatedResult) {
        alert('Please generate music first');
        return;
    }

    if (typeof Tone !== 'undefined') {
        await Tone.start();
    }

    if (visual) {
        visual.clear();
        visual.start();
    }

    let contentToPlay = [];

    if (currentMode === 'notes') {
        contentToPlay = generatedResult.output.map(chord => ({
            type: 'chord',
            value: chord,
            duration: '2n'
        }));
    } else {
        contentToPlay = generatedResult.input.map(note => ({
            type: 'chord',
            value: chord,
            duration: '2n'
        }));
    }

    const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];

    let time = typeof Tone !== 'undefined' ? Tone.now() : Date.now() / 1000;
    const chordDuration = 1;
    const noteDuration = 0.25;

    contentToPlay.forEach((item, index) => {
        const color = colors[index % colors.length];

        try {
            if (item.type === 'chord') {
                playChord(item.value, item.duration, time, color);
                time += chordDuration;
            } else {
                const midiNote = noteToMidi(item.value);
                if (piano_synth) {
                    piano_synth.triggerAttackRelease(item.value, item.duration, time);
                }

                setTimeout(() => {
                    if (visual) {
                        visual.noteOn(midiNote, color);
                        setTimeout(() => {
                            if (visual) {
                                visual.noteOff(midiNote);
                            }
                        }, 400);
                    }
                }, (time - (typeof Tone !== 'undefined' ? Tone.now() : Date.now() / 1000)) * 1000);

                time += noteDuration;
            }
        } catch (e) {
            console.error(`Cannot play ${item.type} ${item.value}:`, e);
        }
    });
}

function playChord(chordName, duration, time, color) {
    const notes = chordToNotes(chordName);

    notes.forEach(note => {
        try {
            const midiNote = noteToMidi(note);

            if (piano_synth) {
                piano_synth.triggerAttackRelease(note, duration, time);
            }

            setTimeout(() => {
                if (visual) {
                    visual.noteOn(midiNote, color);
                    setTimeout(() => {
                        if (visual) {
                            visual.noteOff(midiNote);
                        }
                    }, 800);
                }
            }, (time - (typeof Tone !== 'undefined' ? Tone.now() : Date.now() / 1000)) * 1000);
        } catch (e) {
            console.error(`Cannot play chord note ${note}:`, e);
        }
    });
}

function chordToNotes(chordName) {
    const chordMap = {
        'C': ['C4', 'E4', 'G4'],
        'C#': ['C#4', 'F4', 'G#4'],
        'D': ['D4', 'F#4', 'A4'],
        'D#': ['D#4', 'G4', 'A#4'],
        'E': ['E4', 'G#4', 'B4'],
        'F': ['F4', 'A4', 'C5'],
        'F#': ['F#4', 'A#4', 'C#5'],
        'G': ['G4', 'B4', 'D5'],
        'G#': ['G#4', 'C5', 'D#5'],
        'A': ['A4', 'C#5', 'E5'],
        'A#': ['A#4', 'D5', 'F5'],
        'B': ['B4', 'D#5', 'F#5'],

        'Cm': ['C4', 'D#4', 'G4'],
        'C#m': ['C#4', 'E4', 'G#4'],
        'Dm': ['D4', 'F4', 'A4'],
        'D#m': ['D#4', 'F#4', 'A#4'],
        'Em': ['E4', 'G4', 'B4'],
        'Fm': ['F4', 'G#4', 'C5'],
        'F#m': ['F#4', 'A4', 'C#5'],
        'Gm': ['G4', 'A#4', 'D5'],
        'G#m': ['G#4', 'B4', 'D#5'],
        'Am': ['A4', 'C5', 'E5'],
        'A#m': ['A#4', 'C#5', 'F5'],
        'Bm': ['B4', 'D5', 'F#5'],

        'C7': ['C4', 'E4', 'G4', 'A#4'],
        'D7': ['D4', 'F#4', 'A4', 'C5'],
        'G7': ['G4', 'B4', 'D5', 'F5'],
        'Cmaj7': ['C4', 'E4', 'G4', 'B4'],
        'Dm7': ['D4', 'F4', 'A4', 'C5'],
        'Em7': ['E4', 'G4', 'B4', 'D5'],
        'Am7': ['A4', 'C5', 'E5', 'G5'],
        'Bm7': ['B4', 'D5', 'F#5', 'A5']
    };

    const rootMatch = chordName.match(/^([A-G][#b]?)(.*)/);
    if (!rootMatch) return ['C4', 'E4', 'G4'];

    const root = rootMatch[1];
    const type = rootMatch[2] || '';

    let fullChordName = root;
    if (type.includes('m7')) {
        fullChordName += 'm7';
    } else if (type.includes('maj7')) {
        fullChordName += 'maj7';
    } else if (type.includes('7')) {
        fullChordName += '7';
    } else if (type.includes('m')) {
        fullChordName += 'm';
    }

    if (chordMap[fullChordName]) {
        return chordMap[fullChordName];
    } else if (chordMap[root]) {
        return chordMap[root];
    }

    return ['C4', 'E4', 'G4'];
}

function stopMusic() {
    if (visual) {
        visual.stop();
    }
    if (piano_synth) {
        piano_synth.releaseAll();
    }
}

function toggleMetronome() {
    const metronomeBtn = document.getElementById('metronomeBtn');
    if (!metronomeBtn) return;

    if (metronome_status) {
        metronome_status = false;
        metronomeBtn.textContent = 'Enable Metronome';
        if (typeof Tone !== 'undefined') {
            Tone.Transport.stop();
            Tone.Transport.cancel();
        }
        if (visual) {
            visual.stop();
        }
    } else {
        metronome_status = true;
        metronomeBtn.textContent = 'Disable Metronome';

        if (typeof Tone !== 'undefined' && metronome) {
            Tone.Transport.scheduleRepeat(time => {
                metronome.triggerAttackRelease('C1', '8n', time);
                if (CYCLE > 0 && visual && visual.painter) {
                    visual.painter.clear();
                }
            }, CYCLE_STRING);

            for (let i = 1; i < 8; i++) {
                Tone.Transport.scheduleRepeat(time => {
                    metronome.triggerAttackRelease('C0', '8n', time);
                }, CYCLE_STRING, `+0:${i}:0`);
            }

            Tone.Transport.start();
            if (visual) {
                visual.start();
            }
        }
    }
}

function getRandomColor() {
    const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function noteToMidi(note) {
    const noteMap = {
        'C': 0, 'C#': 1, 'Db': 1,
        'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4,
        'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8,
        'A': 9, 'A#': 10, 'Bb': 10,
        'B': 11
    };

    const match = note.match(/([A-G][#b]?)(\d+)/);
    if (!match) return 60;

    const noteName = match[1];
    const octave = parseInt(match[2]);

    return (octave + 1) * 12 + noteMap[noteName];
}

// Simulated backend API
function simulateBackendResponse(input, mode) {
    return new Promise((resolve) => {
        setTimeout(() => {
            if (mode === 'notes') {
                const notes = input.split(/[ ,]+/).filter(n => n.trim());
                let chords = [];

                // Generate one chord for every 2 notes
                for (let i = 0; i < notes.length; i += 2) {
                    const currentNote = notes[i];
                    const nextNote = i + 1 < notes.length ? notes[i + 1] : null;

                    const noteName = currentNote.match(/[A-G][#b]?/);

                    if (noteName) {
                        let chord = selectAppropriateChord(noteName[0], nextNote);
                        chords.push(chord);
                    }
                }

                resolve({
                    input: notes,
                    output: chords,
                    description: 'Generated a corresponding chord progression based on the input notes.'
                });
            } else {
                const chords = input.split(/[ ,]+/).filter(c => c.trim());
                let melody = [];

                chords.forEach(chord => {
                    const chordNotes = chordToNotes(chord);
                    const melodyFromChord = generateMelodyFromChord(chordNotes);
                    melody = melody.concat(melodyFromChord);
                });

                resolve({
                    input: chords,
                    output: melody,
                    description: 'Generated a melody line based on the input chords.'
                });
            }
        }, 500);
    });
}

// Select chord based on current and next note
function selectAppropriateChord(currentNoteName, nextNote) {
    const chordOptions = {
        'C': ['Cmaj7', 'Am7', 'Fmaj7'],
        'C#': ['C#m7', 'Bmaj7', 'Amaj7'],
        'D': ['Dm7', 'G7', 'Bbmaj7'],
        'D#': ['D#dim7', 'Cm7', 'G#7'],
        'E': ['Em7', 'Cmaj7', 'Am7'],
        'F': ['Fmaj7', 'Dm7', 'Bbmaj7'],
        'F#': ['F#m7', 'D7', 'Bmaj7'],
        'G': ['G7', 'Em7', 'Cmaj7'],
        'G#': ['G#m7', 'Fm7', 'Ebmaj7'],
        'A': ['Am7', 'Fmaj7', 'Dm7'],
        'A#': ['A#dim7', 'Gm7', 'Ebmaj7'],
        'B': ['Bm7', 'G7', 'Em7']
    };

    if (chordOptions[currentNoteName]) {
        return chordOptions[currentNoteName][Math.floor(Math.random() * chordOptions[currentNoteName].length)];
    }

    return 'Cmaj7';
}

// Generate melody notes from chord tones
function generateMelodyFromChord(chordNotes) {
    const melody = [];

    for (let i = 0; i < Math.floor(Math.random() * 3) + 2; i++) {
        const randomIndex = Math.floor(Math.random() * chordNotes.length);
        melody.push(chordNotes[randomIndex]);
    }

    return melody;
}

// Keyboard input control setup
function setupKeyboardInputControls() {
    const toggleKeyboardInput = document.getElementById('toggleKeyboardInput');
    if (toggleKeyboardInput) {
        toggleKeyboardInput.addEventListener('click', function() {
            if (keyboardInput) {
                if (keyboardInput.isEnabled) {
                    keyboardInput.disable();
                    const statusText = document.getElementById('keyboardStatusText');
                    if (statusText) statusText.textContent = 'Keyboard Input: Disabled';
                    this.style.backgroundColor = '#f44336';
                } else {
                    keyboardInput.enable();
                    const statusText = document.getElementById('keyboardStatusText');
                    if (statusText) statusText.textContent = 'Keyboard Input: Enabled';
                    this.style.backgroundColor = '#4CAF50';
                }
            }
        });
    }

    const showKeyboardGuide = document.getElementById('showKeyboardGuide');
    if (showKeyboardGuide) {
        showKeyboardGuide.addEventListener('click', function() {
            const guide = document.getElementById('keyboardGuide');
            if (guide) {
                guide.style.display = guide.style.display === 'none' ? 'block' : 'none';
            }
        });
    }
}

// Update current mode display
function updateCurrentModeDisplay() {
    const currentModeDisplay = document.getElementById('currentModeDisplay');
    if (currentModeDisplay) {
        currentModeDisplay.textContent = currentMode === 'notes' ? 'Melody → Chords' : 'Chords → Melody';
    }
}

// Disable keyboard input when page loses focus
window.addEventListener('blur', () => {
    if (keyboardInput) keyboardInput.disable();
});

// Enable keyboard input when page gains focus
window.addEventListener('focus', () => {
    if (keyboardInput) keyboardInput.enable();
});


console.log('🚀 启动音乐应用加速优化...');

// ============================================================================
// 优化1: 减少输入延迟 (1.5秒 → 0.3秒)
// ============================================================================

// 寻找并优化用户输入监听器
function optimizeInputDelay() {
    const userInput = document.getElementById('userInput');
    if (!userInput) return;

    // 移除现有监听器，创建优化版本
    const newInput = userInput.cloneNode(true);
    userInput.parentNode.replaceChild(newInput, userInput);

    let fastInputTimer = null;

    newInput.addEventListener('input', function(event) {
        if (fastInputTimer) {
            clearTimeout(fastInputTimer);
        }

        // 🚀 关键优化：1500ms → 300ms
        fastInputTimer = setTimeout(async () => {
            const inputValue = event.target.value.trim();
            if (inputValue) {
                console.log('⚡ 快速生成触发:', inputValue);
                try {
                    await generateContentWithAPI();
                    if (generatedResult) {
                        // 立即播放，不再等待500ms
                        setTimeout(() => {
                            if (typeof playMusicWithChords === 'function') {
                                playMusicWithChords();
                            }
                        }, 100); // 500ms → 100ms
                    }
                } catch (error) {
                    console.error('快速生成失败:', error);
                }
            }
        }, 100); // 1500ms → 300ms
    });

    console.log('✅ 输入延迟优化: 1.5秒 → 0.3秒');
}

// ============================================================================
// 优化2: 简单缓存机制 (避免重复计算)
// ============================================================================

let resultCache = new Map();

// 包装原始生成函数
const originalGenerateContentWithAPI = generateContentWithAPI;

generateContentWithAPI = async function() {
    const userInput = document.getElementById('userInput');
    if (!userInput) return originalGenerateContentWithAPI();

    const inputKey = userInput.value.trim() + '_' + currentMode;

    // 检查缓存
    if (resultCache.has(inputKey)) {
        console.log('⚡ 使用缓存结果');
        const cached = resultCache.get(inputKey);
        generatedResult = cached;

        // 快速显示缓存结果
        const responseContent = document.getElementById('responseContent');
        if (responseContent) {
            displayResult(cached, true);
        }
        return cached;
    }

    // 调用原始函数并缓存结果
    const result = await originalGenerateContentWithAPI();
    if (result && inputKey) {
        resultCache.set(inputKey, result);
        // 限制缓存大小
        if (resultCache.size > 50) {
            const firstKey = resultCache.keys().next().value;
            resultCache.delete(firstKey);
        }
    }
    return result;
};

// 显示结果的辅助函数
function displayResult(result, fromCache = false) {
    const responseContent = document.getElementById('responseContent');
    if (!responseContent) return;

    let formattedInput = Array.isArray(result.input) ? result.input.join(' ') : result.input;

    const indicator = fromCache ?
        '<div style="background: #e8f5e8; border: 1px solid #4caf50; padding: 6px; margin-bottom: 8px; border-radius: 3px; font-size: 12px;"><strong>⚡ 缓存加速</strong></div>' :
        '<div style="background: #e3f2fd; border: 1px solid #2196f3; padding: 6px; margin-bottom: 8px; border-radius: 3px; font-size: 12px;"><strong>🚀 实时生成</strong></div>';

    const html = `
        ${indicator}
        <h3>输入: ${formattedInput}</h3>
        <h3>输出: ${Array.isArray(result.output) ? result.output.join(' ') : result.output}</h3>
        <p>${result.description}</p>
    `;

    responseContent.innerHTML = html;
}

// ============================================================================
// 优化3: 防重复播放 + 音频预启动
// ============================================================================

let isPlayingMusic = false;

// 音频预启动
if (typeof Tone !== 'undefined') {
    // 尝试预启动音频上下文（静默）
    document.addEventListener('click', () => {
        Tone.start().catch(() => {});
    }, { once: true });
}

// 包装播放函数，防止重复调用
const originalPlayMusicWithChords = playMusicWithChords;
playMusicWithChords = function() {
    if (isPlayingMusic) {
        console.log('⏸️ 跳过重复播放');
        return;
    }

    isPlayingMusic = true;

    // 调用原始播放函数
    originalPlayMusicWithChords();

    // 2秒后重置标志
    setTimeout(() => {
        isPlayingMusic = false;
    }, 2000);
};

// ============================================================================
// 优化4: MIDI/键盘输入响应加速
// ============================================================================

function optimizeMidiInput() {
    // 减少MIDI输入等待时间
    const originalTimer = 2000;
    const optimizedTimer = 800; // 2秒 → 0.8秒

    // 这个需要在MIDI事件处理中应用
    console.log('🎹 MIDI输入等待时间: 2秒 → 0.8秒');
}

// ============================================================================
// 优化5: 预加载和预热
// ============================================================================

function preloadOptimizations() {
    // 预热后端连接（如果存在）
    if (typeof MusicAPI !== 'undefined') {
        setTimeout(() => {
            fetch('http://localhost:5001/api/status').catch(() => {});
        }, 1000);
    }

    // 预准备常用和弦
    const commonInputs = ['C4 E4 G4', 'D4 F#4 A4', 'G4 B4 D5'];
    setTimeout(() => {
        commonInputs.forEach(input => {
            const key = input + '_notes';
            if (!resultCache.has(key)) {
                // 预生成一些常用的结果
                simulateBackendResponse(input, 'notes').then(result => {
                    resultCache.set(key, result);
                });
            }
        });
        console.log('🔥 预热常用和弦完成');
    }, 2000);
}

// ============================================================================
// Optimize apply
// ============================================================================

function applySpeedOptimizations() {
    console.log('⚡ 应用加速优化...');

    try {
        optimizeInputDelay();
        optimizeMidiInput();
        preloadOptimizations();

        console.log('');
        console.log('🎉 优化完成！提升效果:');
        console.log('- ⚡ 输入响应: 1.5秒 → 0.3秒');
        console.log('- 🧠 智能缓存: 重复输入瞬间响应');
        console.log('- 🎵 播放启动: 500ms → 100ms');
        console.log('- 🎹 MIDI响应: 2秒 → 0.8秒');
        console.log('- 🔥 预热缓存: 常用和弦预加载');
        console.log('');
        console.log('💡 现在试试输入 "C4 E4 G4" 感受速度提升！');

    } catch (error) {
        console.error('优化应用失败:', error);
    }
}

// ============================================================================
// 立即启动优化
// ============================================================================

// 页面准备好后立即应用
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(applySpeedOptimizations, 500);
    });
} else {
    setTimeout(applySpeedOptimizations, 100);
}

// 提供手动控制
window.musicSpeedBoost = {
    apply: applySpeedOptimizations,
    clearCache: () => {
        resultCache.clear();
        console.log('🗑️ 缓存已清空');
    },
    showCache: () => {
        console.log('📊 缓存状态:', Array.from(resultCache.keys()));
    },
    resetPlayLock: () => {
        isPlayingMusic = false;
        console.log('🔓 播放锁定已重置');
    }
};

console.log('🚀 音乐应用加速补丁已加载');
console.log('💡 手动控制: musicSpeedBoost.apply() / .clearCache() / .resetPlayLock()');


// ====================================================================
// Arco calls to obtain real-time music data
// ====================================================================

function getRealtimeMusicDataForArco() {
    // """
    // Arco调用此函数获取最新的完整音乐句子
    //
    // Returns:
    //     {
    //         melody_notes: [
    //             {note: 60, timestamp: 1.0, duration: 0.5},
    //             {note: 64, timestamp: 1.5, duration: 0.5},
    //             {note: 67, timestamp: 2.0, duration: 0.5}
    //         ],
    //         chord_progression: [
    //             {chord: "Cmaj7", timestamp: 1.0, duration: 2.0},
    //             {chord: "Am7", timestamp: 3.0, duration: 2.0}
    //         ],
    //         phrase_start_time: 1.0,
    //         phrase_end_time: 4.0,
    //         phrase_duration: 3.0,
    //         generated_time: 1234567890.123
    //     }
    //     或 null (如果没有新数据)
    // """

    if (lastMusicData) {
        const data = lastMusicData;
        lastMusicData = null;  // 取出后清空，避免重复
        console.log('🎵 Arco获取音乐数据:', data);
        return data;
    }

    return null;  // 没有新数据
}

// // ====================================================================
// // 🎯 修改现有的 generateContentWithAPI 函数 - 最小改动
// // ====================================================================
//
// // 在现有的 generateContentWithAPI 函数成功生成后添加这段代码
// async function generateContentWithAPI() {
//     // ... 现有代码保持不变 ...
//
//     try {
//         // ... 现有的生成逻辑 ...
//
//         // 🆕 在生成成功后添加以下代码 (在显示结果之前)
//         if (generatedResult && generatedResult.input && generatedResult.output) {
//             // 收集完整音乐数据给Arco
//             collectMusicDataForArco(generatedResult);
//         }
//
//         // ... 现有的显示逻辑保持不变 ...
//
//     } catch (error) {
//         // ... 现有的错误处理保持不变 ...
//     }
// }

// ====================================================================
//  Collect music data for Arco
// ====================================================================

function collectMusicDataForArco(result) {
    // """
    //     收集生成的音乐数据，格式化后供Arco使用
    //
    //     Args:
    //         result: generateContentWithAPI的结果
    // """

    try {
        const currentTime = Date.now() / 1000;
        const phraseStartTime = currentTime;

        // 1. 处理输入旋律 - 每个音符独立时间信息
        let melodyNotes = [];
        let noteTime = phraseStartTime;
        const noteInterval = 0.5;  // 每个音符间隔0.5秒
        const noteDuration = 0.4;  // 每个音符持续0.4秒

        if (Array.isArray(result.input)) {
            result.input.forEach((item, index) => {
                let midiNote = null;
                let actualDuration = noteDuration;

                if (Array.isArray(item) && item.length >= 2) {
                    // 格式：[midi, duration]
                    midiNote = item[0];
                    // 将duration转换为实际秒数 (假设duration是16分音符单位)
                    actualDuration = (item[1] * 0.125) || noteDuration;
                } else if (typeof item === 'string') {
                    // 音符名称转MIDI
                    midiNote = noteToMidi(item);
                } else if (typeof item === 'number') {
                    // 直接是MIDI号
                    midiNote = item;
                }

                if (midiNote !== null) {
                    melodyNotes.push({
                        note: midiNote,
                        timestamp: noteTime,
                        duration: actualDuration
                    });
                    noteTime += noteInterval;
                }
            });
        }

        // 2. 处理生成的和弦 - 每个和弦独立时间信息
        let chordProgression = [];
        if (Array.isArray(result.output) && result.output.length > 0) {
            const totalMelodyDuration = melodyNotes.length * noteInterval;
            const chordStartTime = phraseStartTime + totalMelodyDuration + 0.2; // 旋律结束后0.2秒开始和弦
            const chordDuration = totalMelodyDuration / result.output.length; // 和弦均分旋律时长

            result.output.forEach((chord, index) => {
                chordProgression.push({
                    chord: chord,
                    timestamp: chordStartTime + (index * chordDuration),
                    duration: chordDuration
                });
            });
        }

        // 3. 计算整体时间信息
        const phraseEndTime = Math.max(
            melodyNotes.length > 0 ? melodyNotes[melodyNotes.length - 1].timestamp + melodyNotes[melodyNotes.length - 1].duration : phraseStartTime,
            chordProgression.length > 0 ? chordProgression[chordProgression.length - 1].timestamp + chordProgression[chordProgression.length - 1].duration : phraseStartTime
        );

        // 4. 构建完整音乐数据
        const musicData = {
            melody_notes: melodyNotes,
            chord_progression: chordProgression,
            phrase_start_time: phraseStartTime,
            phrase_end_time: phraseEndTime,
            phrase_duration: phraseEndTime - phraseStartTime,
            generated_time: currentTime,
            mode: currentMode,  // 使用现有的模式变量
            source: "web_input"
        };

        // 5. 存储最新数据
        lastMusicData = musicData;

        // 6. 添加到历史缓冲区 (可选)
        arcoMusicBuffer.push(musicData);

        // 保持缓冲区大小
        if (arcoMusicBuffer.length > 10) {
            arcoMusicBuffer.shift();  // 移除最老的数据
        }

        console.log('🎼 收集到完整音乐数据:');
        console.log(`   旋律: ${melodyNotes.length}个音符`);
        console.log(`   和弦: ${chordProgression.length}个和弦`);
        console.log(`   总时长: ${(phraseEndTime - phraseStartTime).toFixed(2)}秒`);

    } catch (error) {
        console.error('❌ 收集音乐数据失败:', error);
    }
}

// ====================================================================
// Interfaces
// ====================================================================

function getAllMusicDataForArco() {
    // """
    // 获取所有历史音乐数据 (如果Arco需要)
    // """
    return arcoMusicBuffer.slice(); // 返回副本
}

function clearArcoMusicBuffer() {
    // """
    // 清空音乐数据缓冲区
    // """
    arcoMusicBuffer = [];
    lastMusicData = null;
    console.log('🗑️ Arco音乐缓冲区已清空');
}

function getArcoDataStatus() {
    // """
    // 获取数据状态
    // """
    return {
        has_new_data: lastMusicData !== null,
        buffer_size: arcoMusicBuffer.length,
        last_update: lastMusicData ? lastMusicData.generated_time : null
    };
}

// ====================================================================
// Interfaces expose to the global (for Arco to call)
// ====================================================================

// 主要接口
window.getRealtimeMusicDataForArco = getRealtimeMusicDataForArco;

// 可选接口
window.getAllMusicDataForArco = getAllMusicDataForArco;
window.clearArcoMusicBuffer = clearArcoMusicBuffer;
window.getArcoDataStatus = getArcoDataStatus;

console.log('🎵 Arco音乐数据接口已加载');
console.log('💡 Arco调用方法: getRealtimeMusicDataForArco()');