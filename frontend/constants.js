// 定义常量
const CONSTANTS = {
            COLORS: {
                red: '#EE2B29',
                orange: '#ff9800',
                yellow: '#ffff00',
                green: '#c6ff00',
                cyan: '#00e5ff',
                blue: '#2979ff',
                purple: '#651fff',
                meta: '#d500f9'
            },
            NOTES_PER_OCTAVE: 12,
            WHITE_NOTES_PER_OCTAVE: 7,
            LOWEST_PIANO_KEY_MIDI_NOTE: 21,
            REFRESH_RATE: 60,
        };
        
        // 音符名称对应表
        const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        // 和弦定义
        const CHORD_DEFINITIONS = {
            'C': ['C', 'E', 'G'],
            'Cm': ['C', 'D#', 'G'],
            'C7': ['C', 'E', 'G', 'A#'],
            'Cmaj7': ['C', 'E', 'G', 'B'],
            'Dm': ['D', 'F', 'A'],
            'D7': ['D', 'F#', 'A', 'C'],
            'Em': ['E', 'G', 'B'],
            'E7': ['E', 'G#', 'B', 'D'],
            'F': ['F', 'A', 'C'],
            'Fmaj7': ['F', 'A', 'C', 'E'],
            'G': ['G', 'B', 'D'],
            'G7': ['G', 'B', 'D', 'F'],
            'Am': ['A', 'C', 'E'],
            'A7': ['A', 'C#', 'E', 'G'],
            'Bdim': ['B', 'D', 'F']
        };
        
        // 音符到和弦的映射 (简化版)
        const NOTE_TO_CHORD_MAP = {
            'C': ['C', 'Am', 'F'],
            'C#': ['C#', 'Bbm'],
            'D': ['D', 'Bm', 'G'],
            'D#': ['D#', 'Cm'],
            'E': ['E', 'C#m', 'A'],
            'F': ['F', 'Dm', 'Bb'],
            'F#': ['F#', 'D#m'],
            'G': ['G', 'Em', 'C'],
            'G#': ['G#', 'Fm'],
            'A': ['A', 'F#m', 'D'],
            'A#': ['A#', 'Gm'],
            'B': ['B', 'G#m', 'E']
        };

        // 将音符字符串转换为MIDI数字
        function noteToMidi(note) {
            // 例如: 'C4' => 60
            const noteName = note.match(/[A-G][#b]?/)[0];
            const octave = parseInt(note.match(/\d+/)[0]);
            
            const noteIndex = NOTE_NAMES.indexOf(noteName);
            if (noteIndex === -1) return 60; // 默认 C4
            
            return 12 * (octave + 1) + noteIndex;
        }
        
        // 将MIDI数字转换为音符名称// 定义常量
// const CONSTANTS = {
//             COLORS: {
//                 red: '#EE2B29',
//                 orange: '#ff9800',
//                 yellow: '#ffff00',
//                 green: '#c6ff00',
//                 cyan: '#00e5ff',
//                 blue: '#2979ff',
//                 purple: '#651fff',
//                 meta: '#d500f9'
//             },
//             NOTES_PER_OCTAVE: 12,
//             WHITE_NOTES_PER_OCTAVE: 7,
//             LOWEST_PIANO_KEY_MIDI_NOTE: 21,
//             REFRESH_RATE: 60,
//         };
//
//         // 音符名称对应表
//         const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
//
//         // 和弦定义
//         const CHORD_DEFINITIONS = {
//             'C': ['C', 'E', 'G'],
//             'Cm': ['C', 'D#', 'G'],
//             'C7': ['C', 'E', 'G', 'A#'],
//             'Cmaj7': ['C', 'E', 'G', 'B'],
//             'Dm': ['D', 'F', 'A'],
//             'D7': ['D', 'F#', 'A', 'C'],
//             'Em': ['E', 'G', 'B'],
//             'E7': ['E', 'G#', 'B', 'D'],
//             'F': ['F', 'A', 'C'],
//             'Fmaj7': ['F', 'A', 'C', 'E'],
//             'G': ['G', 'B', 'D'],
//             'G7': ['G', 'B', 'D', 'F'],
//             'Am': ['A', 'C', 'E'],
//             'A7': ['A', 'C#', 'E', 'G'],
//             'Bdim': ['B', 'D', 'F']
//         };
//
//         // 音符到和弦的映射 (简化版)
//         const NOTE_TO_CHORD_MAP = {
//             'C': ['C', 'Am', 'F'],
//             'C#': ['C#', 'Bbm'],
//             'D': ['D', 'Bm', 'G'],
//             'D#': ['D#', 'Cm'],
//             'E': ['E', 'C#m', 'A'],
//             'F': ['F', 'Dm', 'Bb'],
//             'F#': ['F#', 'D#m'],
//             'G': ['G', 'Em', 'C'],
//             'G#': ['G#', 'Fm'],
//             'A': ['A', 'F#m', 'D'],
//             'A#': ['A#', 'Gm'],
//             'B': ['B', 'G#m', 'E']
//         };
//
//         // 将音符字符串转换为MIDI数字
//         function noteToMidi(note) {
//             // 例如: 'C4' => 60
//             const noteName = note.match(/[A-G][#b]?/)[0];
//             const octave = parseInt(note.match(/\d+/)[0]);
//
//             const noteIndex = NOTE_NAMES.indexOf(noteName);
//             if (noteIndex === -1) return 60; // 默认 C4
//
//             return 12 * (octave + 1) + noteIndex;
//         }
//
//         // 将MIDI数字转换为音符名称
//         function midiToNote(midi) {
//             const octave = Math.floor(midi / 12) - 1;
//             const noteIndex = midi % 12;
//             return NOTE_NAMES[noteIndex] + octave;
//         }
//         if (typeof CONSTANTS === 'undefined') {
//             const CONSTANTS = {
//                 // 常量定义...
//                 REFRESH_RATE: 30
//                 // 其他常量...
//             };
//             window.CONSTANTS = CONSTANTS; // 将其暴露为全局变量
//         }
        function midiToNote(midi) {
            const octave = Math.floor(midi / 12) - 1;
            const noteIndex = midi % 12;
            return NOTE_NAMES[noteIndex] + octave;
        }
        if (typeof CONSTANTS === 'undefined') {
            const CONSTANTS = {
                // 常量定义...
                REFRESH_RATE: 30
                // 其他常量...
            };
            window.CONSTANTS = CONSTANTS; // 将其暴露为全局变量
        }