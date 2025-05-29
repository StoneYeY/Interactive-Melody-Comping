class MusicAPI {
    constructor(baseUrl = 'http://localhost:5001') {
        this.baseUrl = baseUrl;
        console.log('MusicAPI initialized with baseUrl:', baseUrl);
    }

    async checkStatus() {
        try {
            console.log('Checking backend status...');
            const response = await fetch(`${this.baseUrl}/api/status`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Backend status OK:', data);
            return data;
        } catch (error) {
            console.error('Failed to connect to backend:', error);
            throw new Error('Backend server unreachable. Make sure it is running.');
        }
    }

    async harmonizeMelody(melody, temperature = 1.0, k = 20) {
        try {
            await this.checkStatus();

            console.log('Sending harmonization request...');
            const response = await fetch(`${this.baseUrl}/api/harmonize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    melody: melody,
                    temperature: temperature,
                    k: k,
                    mode: 'notes'
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API error response:', errorText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Harmonization result received:', result);
            return result;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    parseNotesToMelody(noteString) {
        console.log('Parsing note string:', noteString);

        if (!noteString || typeof noteString !== 'string') {
            console.error('Invalid input');
            return [];
        }

        const trimmedInput = noteString.trim();
        if (!trimmedInput) {
            console.error('Empty input');
            return [];
        }

        const parts = trimmedInput.split(/\s+/).filter(part => part.trim());
        const melody = [];

        parts.forEach((part, index) => {
            let note, duration;

            if (part.includes(':')) {
                const [notePart, durationPart] = part.split(':');
                const midiNumber = this.noteToMidi(notePart.trim());
                duration = parseInt(durationPart.trim()) || 4;

                if (midiNumber !== null) {
                    melody.push([midiNumber, duration]);
                }
            } else if (part.includes('/')) {
                const [notePart, durationPart] = part.split('/');
                const midiNumber = this.noteToMidi(notePart.trim());
                duration = parseInt(durationPart.trim()) || 4;

                if (midiNumber !== null) {
                    melody.push([midiNumber, duration]);
                }
            } else {
                const midiNumber = this.noteToMidi(part.trim());
                duration = 4;

                if (midiNumber !== null) {
                    melody.push([midiNumber, duration]);
                }
            }
        });

        console.log('Parsed melody:', melody);
        return melody;
    }

    noteToMidi(note) {
        if (!note || typeof note !== 'string') {
            console.error('Invalid note string:', note);
            return null;
        }

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
        if (!match) {
            console.error('Invalid note format:', note);
            return null;
        }

        const noteName = match[1];
        const octave = parseInt(match[2]);

        if (!(noteName in noteMap)) {
            console.error('Unknown note name:', noteName);
            return null;
        }

        return (octave + 1) * 12 + noteMap[noteName];
    }

    midiToNote(midiNumber) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNumber / 12) - 1;
        const noteIndex = midiNumber % 12;
        return noteNames[noteIndex] + octave;
    }

    formatChordResponse(apiResponse) {
        const result = {
            input: apiResponse.input || [],
            output: apiResponse.output || [],
            description: apiResponse.description || 'Chord progression generated using the backend model.'
        };
        return result;
    }
}

// Expose MusicAPI to global scope
window.MusicAPI = MusicAPI;

console.log('api.js loaded successfully. MusicAPI is available globally.');

// Optional: Run test parsing when page loads
document.addEventListener('DOMContentLoaded', function() {
    const api = new MusicAPI();

    const testInputs = [
        'C4:2 D4:8 E4:4',
        'C4/2 D4/8 E4/4',
        'C4 D4 E4',
        'C4:1 D#4:16 F4:2'
    ];

    testInputs.forEach(input => {
        const result = api.parseNotesToMelody(input);
        console.log(`Parsed: "${input}" →`, result);
    });
});