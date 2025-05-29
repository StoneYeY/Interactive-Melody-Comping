/**
 * keyboardInput.js
 * 处理键盘输入并映射到钢琴卷帘 - 默认录制模式版本
 */

class KeyboardInput {
    constructor(pianoVisual, audioEngine) {
        this.pianoVisual = pianoVisual;
        this.audioEngine = audioEngine;
        this.isEnabled = true;
        this.pressedKeys = new Set(); // 跟踪按下的键
        this.currentOctave = 4; // 默认八度
        this.sustainMode = false; // 延音模式

        // 🆕 录制模式相关
        this.recordingMode = true; // 🎯 默认开启录制模式
        this.noteStartTimes = new Map(); // 记录每个键的开始时间
        this.pendingNotes = new Map(); // 待更新时值的音符

        // 键盘映射 - 基于标准钢琴键盘布局
        this.keyMap = {
            // 白键 (一个八度)
            'KeyA': { note: 'C', color: 'white' },
            'KeyS': { note: 'D', color: 'white' },
            'KeyD': { note: 'E', color: 'white' },
            'KeyF': { note: 'F', color: 'white' },
            'KeyG': { note: 'G', color: 'white' },
            'KeyH': { note: 'A', color: 'white' },
            'KeyJ': { note: 'B', color: 'white' },

            // 黑键
            'KeyW': { note: 'C#', color: 'black' },
            'KeyE': { note: 'D#', color: 'black' },
            'KeyT': { note: 'F#', color: 'black' },
            'KeyY': { note: 'G#', color: 'black' },
            'KeyU': { note: 'A#', color: 'black' },

            // 下一个八度的白键
            'KeyK': { note: 'C', octaveOffset: 1, color: 'white' },
            'KeyL': { note: 'D', octaveOffset: 1, color: 'white' },
            'Semicolon': { note: 'E', octaveOffset: 1, color: 'white' },

            // 下一个八度的黑键
            'KeyI': { note: 'C#', octaveOffset: 1, color: 'black' },
            'KeyO': { note: 'D#', octaveOffset: 1, color: 'black' },

            // 低八度的音符 (Z键行)
            'KeyZ': { note: 'C', octaveOffset: -1, color: 'white' },
            'KeyX': { note: 'D', octaveOffset: -1, color: 'white' },
            'KeyC': { note: 'E', octaveOffset: -1, color: 'white' },
            'KeyV': { note: 'F', octaveOffset: -1, color: 'white' },
            'KeyB': { note: 'G', octaveOffset: -1, color: 'white' },
            'KeyN': { note: 'A', octaveOffset: -1, color: 'white' },
            'KeyM': { note: 'B', octaveOffset: -1, color: 'white' },

            // 低八度的黑键
            'KeyQ': { note: 'C#', octaveOffset: -1, color: 'black' },
            'Digit2': { note: 'D#', octaveOffset: -1, color: 'black' },
            'Digit4': { note: 'F#', octaveOffset: -1, color: 'black' },
            'Digit5': { note: 'G#', octaveOffset: -1, color: 'black' },
            'Digit6': { note: 'A#', octaveOffset: -1, color: 'black' }
        };

        // 控制键映射
        this.controlKeys = {
            'ArrowLeft': () => this.changeOctave(-1),
            'ArrowRight': () => this.changeOctave(1),
            'Space': () => this.toggleSustainMode(),
            'Escape': () => this.stopAllNotes(),
            'Enter': () => this.addCurrentNotesToInput(),
            'Backspace': () => this.clearLastNote(),
            'KeyR': () => this.toggleRecordingMode(), // R键切换录制模式
        };

        // 初始化
        this.init();
        this.createKeyboardGuide();
    }

    init() {
        // 绑定键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // 防止页面滚动等默认行为
        document.addEventListener('keydown', (e) => {
            if (this.isEnabled && (this.keyMap[e.code] || this.controlKeys[e.code])) {
                e.preventDefault();
            }
        });

        // 当窗口失去焦点时停止所有音符
        window.addEventListener('blur', () => {
            this.stopAllNotes();
        });

        console.log('🎹 键盘输入已初始化 - 默认录制模式开启');
    }

    handleKeyDown(e) {
        if (!this.isEnabled) return;

        // 如果用户正在输入框中打字，不处理钢琴键盘
        if (this.isTypingInInput(e.target)) return;

        const keyCode = e.code;

        // 处理控制键
        if (this.controlKeys[keyCode]) {
            e.preventDefault();
            this.controlKeys[keyCode]();
            return;
        }

        // 处理音符键
        if (this.keyMap[keyCode] && !this.pressedKeys.has(keyCode)) {
            e.preventDefault();
            this.pressedKeys.add(keyCode);
            this.playNote(keyCode);
        }
    }

    handleKeyUp(e) {
        if (!this.isEnabled) return;

        const keyCode = e.code;

        // 处理音符键释放
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

        // 🆕 录制开始时间
        if (this.recordingMode) {
            this.noteStartTimes.set(keyCode, Date.now());
        }

        // 播放音频
        if (this.audioEngine && this.audioEngine.piano_synth) {
            this.audioEngine.piano_synth.triggerAttack(noteWithOctave);
        }

        // 显示在钢琴卷帘上
        if (this.pianoVisual) {
            const color = this.getRandomColor();
            this.pianoVisual.noteOn(midiNote, color);
        }

        // 🆕 添加音符到输入（临时时值）
        this.addNoteToUserInput(noteWithOctave, keyCode);

        // 显示当前播放的音符
        this.showCurrentNote(noteWithOctave);

        console.log(`🎹 开始播放: ${noteWithOctave} (MIDI: ${midiNote})`);
    }

    stopNote(keyCode) {
        const mapping = this.keyMap[keyCode];
        if (!mapping) return;

        const octave = this.currentOctave + (mapping.octaveOffset || 0);
        const noteWithOctave = mapping.note + octave;
        const midiNote = this.noteToMidi(noteWithOctave);

        // 🆕 录制模式：计算实际时值并更新
        if (this.recordingMode && this.noteStartTimes.has(keyCode)) {
            const actualDuration = this.calculateActualDuration(keyCode);
            this.updateNoteWithActualDuration(keyCode, actualDuration);
            this.noteStartTimes.delete(keyCode);
        }

        // 停止音频
        if (this.audioEngine && this.audioEngine.piano_synth) {
            this.audioEngine.piano_synth.triggerRelease(noteWithOctave);
        }

        // 在钢琴卷帘上释放
        if (this.pianoVisual) {
            this.pianoVisual.noteOff(midiNote);
        }

        console.log(`🎹 停止播放: ${noteWithOctave}`);
    }

    // 🆕 计算实际时值（基于按键时长）
    calculateActualDuration(keyCode) {
        const startTime = this.noteStartTimes.get(keyCode);
        if (!startTime) return 4; // 默认4个16分音符

        const pressDurationMs = Date.now() - startTime;
        const pressDurationSeconds = pressDurationMs / 1000;

        // 将秒转换为16分音符数量（120 BPM = 0.125秒每16分音符）
        const sixteenthNoteLength = 0.125;
        const calculatedDuration = Math.max(1, Math.round(pressDurationSeconds / sixteenthNoteLength));

        console.log(`⏱️ 按键时长: ${pressDurationMs}ms → ${calculatedDuration}个16分音符`);
        return calculatedDuration;
    }

    // 🆕 添加音符到输入（支持录制模式）
    addNoteToUserInput(noteWithOctave, keyCode) {
        const userInput = document.getElementById('userInput');
        if (!userInput) return;

        if (userInput.value && !userInput.value.endsWith(' ')) {
            userInput.value += ' ';
        }

        if (this.recordingMode) {
            // 录制模式：先添加临时时值，释放键时更新
            const tempDuration = 4; // 临时默认值
            userInput.value += `${noteWithOctave}:${tempDuration}`;

            // 记录这个音符在输入中的位置，以便后续更新
            this.pendingNotes.set(keyCode, {
                note: noteWithOctave,
                inputPosition: this.getLastNotePosition(userInput.value)
            });
        } else {
            // 非录制模式：使用默认时值
            userInput.value += `${noteWithOctave}:4`;
        }
    }

    // 🆕 获取最后一个音符在输入中的位置
    getLastNotePosition(inputValue) {
        const parts = inputValue.trim().split(' ');
        return parts.length - 1;
    }

    // 🆕 更新音符的实际时值
    updateNoteWithActualDuration(keyCode, actualDuration) {
        const userInput = document.getElementById('userInput');
        if (!userInput || !this.pendingNotes.has(keyCode)) return;

        const noteInfo = this.pendingNotes.get(keyCode);
        const parts = userInput.value.trim().split(' ');

        if (parts.length > noteInfo.inputPosition) {
            // 更新对应位置的音符时值
            const notePart = parts[noteInfo.inputPosition];
            const colonIndex = notePart.indexOf(':');

            if (colonIndex !== -1) {
                const noteName = notePart.substring(0, colonIndex);
                parts[noteInfo.inputPosition] = `${noteName}:${actualDuration}`;
                userInput.value = parts.join(' ');

                console.log(`✅ 更新音符时值: ${noteName} → ${actualDuration}个16分音符`);
            }
        }

        this.pendingNotes.delete(keyCode);
    }

    // 🆕 切换录制模式
    toggleRecordingMode() {
        this.recordingMode = !this.recordingMode;
        this.updateRecordingDisplay();

        if (this.recordingMode) {
            console.log('🔴 录制模式开启 - 按键时长将自动转换为音符时值');
        } else {
            console.log('⚪ 录制模式关闭 - 使用固定时值');
        }
    }

    stopAllNotes() {
        // 停止所有当前播放的音符
        for (const keyCode of this.pressedKeys) {
            this.stopNote(keyCode);
        }
        this.pressedKeys.clear();

        // 清理录制相关数据
        this.noteStartTimes.clear();
        this.pendingNotes.clear();

        // 释放音频引擎中的所有音符
        if (this.audioEngine && this.audioEngine.piano_synth) {
            this.audioEngine.piano_synth.releaseAll();
        }

        console.log('🛑 停止所有音符');
    }

    changeOctave(direction) {
        const newOctave = this.currentOctave + direction;
        if (newOctave >= 1 && newOctave <= 7) {
            this.currentOctave = newOctave;
            this.updateOctaveDisplay();
            console.log(`🎼 切换到八度: ${this.currentOctave}`);
        }
    }

    toggleSustainMode() {
        this.sustainMode = !this.sustainMode;
        this.updateSustainDisplay();

        if (!this.sustainMode) {
            // 如果关闭延音模式，释放所有音符
            this.stopAllNotes();
        }

        console.log(`🎹 延音模式: ${this.sustainMode ? '开启' : '关闭'}`);
    }

    addCurrentNotesToInput() {
        // 将当前按下的所有音符添加为和弦
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

    // 辅助函数
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
            indicator.textContent = `当前音符: ${note}`;
            indicator.style.opacity = '1';

            setTimeout(() => {
                indicator.style.opacity = '0.5';
            }, 200);
        }
    }

    updateOctaveDisplay() {
        const display = document.getElementById('octaveDisplay');
        if (display) {
            display.textContent = `八度: ${this.currentOctave}`;
        }
    }

    updateSustainDisplay() {
        const display = document.getElementById('sustainDisplay');
        if (display) {
            display.textContent = `延音: ${this.sustainMode ? '开启' : '关闭'}`;
            display.style.color = this.sustainMode ? '#4CAF50' : '#666';
        }
    }

    // 🆕 更新录制模式显示
    updateRecordingDisplay() {
        const display = document.getElementById('recordingDisplay');
        if (display) {
            display.textContent = `录制: ${this.recordingMode ? '开启' : '关闭'}`;
            display.style.color = this.recordingMode ? '#ff6b6b' : '#666';
            display.style.fontWeight = this.recordingMode ? 'bold' : 'normal';
        }
    }

    // 创建键盘指南
    createKeyboardGuide() {
        const guide = document.createElement('div');
        guide.id = 'keyboardGuide';
        guide.className = 'keyboard-guide';
        guide.innerHTML = `
            <div class="guide-header">
                <h4>🎹 录制模式键盘控制</h4>
                <button id="toggleGuide" class="toggle-btn">隐藏</button>
            </div>
            <div class="guide-content" id="guideContent">
                <div class="guide-section">
                    <h5>🎵 音符输入:</h5>
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
                    <h5>⏱️ 录制模式特性:</h5>
                    <ul>
                        <li><strong>按键时长 = 音符时值</strong></li>
                        <li>短按 → 短音符 (1-2个16分音符)</li>
                        <li>长按 → 长音符 (8+个16分音符)</li>
                        <li>松开键时自动计算并更新时值</li>
                        <li>按 <kbd>R</kbd> 可切换录制模式开/关</li>
                    </ul>
                </div>
                <div class="guide-section">
                    <h5>🎮 控制键:</h5>
                    <ul>
                        <li><kbd>←/→</kbd> - 切换八度</li>
                        <li><kbd>空格</kbd> - 切换延音模式</li>
                        <li><kbd>R</kbd> - 切换录制模式</li>
                        <li><kbd>回车</kbd> - 添加和弦到输入</li>
                        <li><kbd>退格</kbd> - 删除最后一个音符</li>
                        <li><kbd>Esc</kbd> - 停止所有音符</li>
                    </ul>
                </div>
                <div class="guide-section">
                    <h5>📊 状态指示:</h5>
                    <div class="status-indicators">
                        <span id="octaveDisplay">八度: 4</span>
                        <span id="sustainDisplay">延音: 关闭</span>
                        <span id="recordingDisplay">录制: 开启</span>
                        <span id="currentNoteIndicator">当前音符: -</span>
                    </div>
                </div>
                <div class="guide-section">
                    <h5>💡 输入格式:</h5>
                    <p>自动生成格式: <code>音符:时值</code></p>
                    <p>例如: <code>C4:2 D4:8 E4:4</code></p>
                    <p class="highlight">⚡ 录制模式默认开启!</p>
                </div>
            </div>
        `;

        // 添加到页面
        document.body.appendChild(guide);

        // 添加切换显示/隐藏功能
        document.getElementById('toggleGuide').addEventListener('click', function() {
            const content = document.getElementById('guideContent');
            const button = this;

            if (content.style.display === 'none') {
                content.style.display = 'block';
                button.textContent = '隐藏';
            } else {
                content.style.display = 'none';
                button.textContent = '显示';
            }
        });

        // 初始化显示
        this.updateOctaveDisplay();
        this.updateSustainDisplay();
        this.updateRecordingDisplay(); // 🆕 显示录制状态
    }

    // 启用/禁用键盘输入
    enable() {
        this.isEnabled = true;
        console.log('🎹 键盘输入已启用');
    }

    disable() {
        this.isEnabled = false;
        this.stopAllNotes();
        console.log('🎹 键盘输入已禁用');
    }

    // 清理资源
    destroy() {
        this.stopAllNotes();
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);

        const guide = document.getElementById('keyboardGuide');
        if (guide) {
            guide.remove();
        }

        console.log('🎹 键盘输入已销毁');
    }
}
// =============================================================================
// 🤖 KeyboardInput 自动生成和弦功能扩展
// 添加到 keyboardInput.js 文件末尾
// =============================================================================

/**
 * 为KeyboardInput类添加自动生成和弦功能
 * 当用户停止弹奏2秒后，自动生成和弦并播放
 */

// 扩展KeyboardInput类的原型，添加自动生成功能
KeyboardInput.prototype.initAutoGeneration = function() {
    console.log('🤖 初始化KeyboardInput自动生成功能...');

    // 自动生成相关属性
    this.autoGenerationEnabled = true;
    this.autoGenerationTimer = null;
    this.autoGenerationDelay = 1000; // 2秒延迟

    // 备份原始方法
    this._originalAddNoteToUserInput = this.addNoteToUserInput;
    this._originalUpdateNoteWithActualDuration = this.updateNoteWithActualDuration;
    this._originalStopAllNotes = this.stopAllNotes;

    // 增强addNoteToUserInput方法
    this.addNoteToUserInput = function(noteWithOctave, keyCode) {
        // 调用原始方法
        this._originalAddNoteToUserInput(noteWithOctave, keyCode);

        // 触发自动生成逻辑
        this.triggerAutoGeneration(`键盘输入音符: ${noteWithOctave}`);
    };

    // 增强updateNoteWithActualDuration方法（录制模式）
    this.updateNoteWithActualDuration = function(keyCode, actualDuration) {
        // 调用原始方法
        this._originalUpdateNoteWithActualDuration(keyCode, actualDuration);

        // 重新触发自动生成
        this.triggerAutoGeneration('音符时值更新');
    };

    // 增强stopAllNotes方法
    this.stopAllNotes = function() {
        // 调用原始方法
        this._originalStopAllNotes();

        // 停止自动生成定时器
        this.stopAutoGeneration();
    };

    console.log('✅ KeyboardInput自动生成功能初始化完成');
};

// 触发自动生成的核心方法
KeyboardInput.prototype.triggerAutoGeneration = function(reason) {
    if (!this.autoGenerationEnabled) return;

    console.log(`🎹 ${reason}，准备自动生成`);

    // 清除之前的定时器
    if (this.autoGenerationTimer) {
        clearTimeout(this.autoGenerationTimer);
        console.log('⏰ 清除之前的自动生成定时器');
    }

    // 设置新的自动生成定时器
    this.autoGenerationTimer = setTimeout(async () => {
        const userInput = document.getElementById('userInput');
        if (userInput && userInput.value.trim()) {
            const inputValue = userInput.value.trim();
            console.log('🚀 键盘输入2秒后自动生成和弦:', inputValue);

            try {
                // 显示生成状态
                this.showGenerationStatus('🎹 Generating...');

                // 触发input事件以启动现有的生成逻辑
                const inputEvent = new Event('input', { bubbles: true });
                userInput.dispatchEvent(inputEvent);

                console.log('✅ 成功触发自动生成');

            } catch (error) {
                console.error('❌ 键盘输入自动生成失败:', error);
                this.showGenerationStatus(`❌ 生成失败: ${error.message}`, 'error');
            }
        } else {
            console.log('📝 输入框为空，跳过自动生成');
        }
    }, this.autoGenerationDelay);

    console.log(`⏰ 设置${this.autoGenerationDelay/1000}秒自动生成定时器`);
};

// 显示生成状态
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

// 停止自动生成
KeyboardInput.prototype.stopAutoGeneration = function() {
    if (this.autoGenerationTimer) {
        clearTimeout(this.autoGenerationTimer);
        this.autoGenerationTimer = null;
        console.log('🛑 停止自动生成定时器');
    }
};

// 设置自动生成延迟
KeyboardInput.prototype.setAutoGenerationDelay = function(delayMs) {
    this.autoGenerationDelay = delayMs;
    console.log(`⏰ 设置自动生成延迟为: ${delayMs}ms`);
};

// 启用/禁用自动生成
KeyboardInput.prototype.toggleAutoGeneration = function() {
    this.autoGenerationEnabled = !this.autoGenerationEnabled;
    if (!this.autoGenerationEnabled) {
        this.stopAutoGeneration();
    }
    console.log(`🤖 自动生成: ${this.autoGenerationEnabled ? '启用' : '禁用'}`);
    return this.autoGenerationEnabled;
};

// 更新键盘指南，添加自动生成说明
KeyboardInput.prototype.updateKeyboardGuideWithAutoGeneration = function() {
    const guideContent = document.getElementById('guideContent');
    if (!guideContent) return;

    // 检查是否已经添加过
    if (document.getElementById('autoGenerationSection')) return;

    const autoGenSection = document.createElement('div');
    autoGenSection.id = 'autoGenerationSection';
    autoGenSection.className = 'guide-section';
    autoGenSection.innerHTML = `
        <h5>🤖 自动生成和弦:</h5>
        <ul>
            <li><strong>弹奏音符后停止2秒 → 自动生成和弦</strong></li>
            <li>无需手动触发，系统自动检测输入停止</li>
            <li>生成完成后自动播放和弦+旋律</li>
            <li>支持录制模式的精确时值</li>
            <li>按 <kbd>Ctrl+G</kbd> 可切换自动生成开/关</li>
        </ul>
        <div class="highlight" style="background: #e8f5e8; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 4px solid #4CAF50;">
            ⚡ <strong>自动生成已启用！</strong><br>
            现在用键盘弹奏音符，停止2秒后会自动生成和弦
        </div>
        <div class="status-line" style="margin-top: 8px; font-size: 0.9em; color: #666;">
            <span id="autoGenStatus">状态: 启用</span> | 
            <span id="autoGenDelay">延迟: 2.0秒</span>
        </div>
    `;

    guideContent.appendChild(autoGenSection);

    // 添加快捷键支持
    this.addAutoGenerationShortcuts();
};

// 添加自动生成快捷键
KeyboardInput.prototype.addAutoGenerationShortcuts = function() {
    // 避免重复添加
    if (this._autoGenShortcutsAdded) return;
    this._autoGenShortcutsAdded = true;

    document.addEventListener('keydown', (e) => {
        // Ctrl+G: 切换自动生成
        if (e.ctrlKey && e.code === 'KeyG' && !this.isTypingInInput(e.target)) {
            e.preventDefault();
            const enabled = this.toggleAutoGeneration();

            // 更新状态显示
            const statusElement = document.getElementById('autoGenStatus');
            if (statusElement) {
                statusElement.textContent = `状态: ${enabled ? '启用' : '禁用'}`;
                statusElement.style.color = enabled ? '#4CAF50' : '#f44336';
            }

            // 显示提示
            this.showCurrentNote(`自动生成: ${enabled ? '启用' : '禁用'}`);
        }
    });
};

// 在KeyboardInput实例创建时自动初始化
// 修改constructor或使用下面的自动初始化代码

// =============================================================================
// 🚀 自动初始化代码 - 当页面加载完成后自动增强现有的KeyboardInput实例
// =============================================================================

// 检查并增强现有的KeyboardInput实例
function autoEnhanceKeyboardInput() {
    console.log('🔍 检查是否需要增强KeyboardInput...');

    // 等待keyboardInput实例创建
    const checkInterval = setInterval(() => {
        if (typeof keyboardInput !== 'undefined' && keyboardInput && !keyboardInput.autoGenerationEnabled) {
            console.log('✅ 发现KeyboardInput实例，开始增强...');

            // 初始化自动生成功能
            keyboardInput.initAutoGeneration();

            // 更新键盘指南
            setTimeout(() => {
                keyboardInput.updateKeyboardGuideWithAutoGeneration();
            }, 1000);

            console.log('🎉 KeyboardInput自动生成功能已启用！');
            console.log('');
            console.log('📖 使用方法:');
            console.log('1. 🎹 用键盘弹奏音符 (A=C, S=D, D=E, F=F, G=G, H=A, J=B)');
            console.log('2. ⏰ 停止弹奏，等待2秒');
            console.log('3. 🎵 系统自动生成和弦并播放');
            console.log('4. 🎮 Ctrl+G 切换自动生成开/关');
            console.log('');

            clearInterval(checkInterval);
        }
    }, 500);

    // 10秒后停止检查
    setTimeout(() => {
        clearInterval(checkInterval);
    }, 10000);
}

// 如果页面已经加载完成，立即执行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoEnhanceKeyboardInput);
} else {
    autoEnhanceKeyboardInput();
}

// =============================================================================
// 🛠️ 调试和测试工具
// =============================================================================

// 添加全局测试函数
window.testKeyboardAutoGeneration = function() {
    console.log('🧪 测试KeyboardInput自动生成功能...');

    if (!keyboardInput || !keyboardInput.autoGenerationEnabled) {
        console.error('❌ KeyboardInput自动生成未启用');
        return;
    }

    console.log('📊 当前状态:');
    console.log('- 自动生成启用:', keyboardInput.autoGenerationEnabled);
    console.log('- 自动生成延迟:', keyboardInput.autoGenerationDelay + 'ms');
    console.log('- 录制模式:', keyboardInput.recordingMode);
    console.log('- 当前八度:', keyboardInput.currentOctave);

    console.log('');
    console.log('🎹 开始模拟键盘输入测试...');

    // 模拟按键序列
    ['KeyA', 'KeyS', 'KeyD'].forEach((keyCode, index) => {
        setTimeout(() => {
            console.log(`🎹 模拟按下: ${keyCode}`);
            keyboardInput.handleKeyDown({
                code: keyCode,
                preventDefault: () => {},
                target: document.body // 确保不在输入框中
            });

            setTimeout(() => {
                keyboardInput.handleKeyUp({
                    code: keyCode,
                    preventDefault: () => {}
                });
            }, 400);
        }, index * 600);
    });

    console.log('⏰ 测试完成，等待2秒后应该自动生成和弦...');
};

// 添加快速设置函数
window.setAutoGenDelay = function(seconds) {
    if (keyboardInput) {
        keyboardInput.setAutoGenerationDelay(seconds * 1000);

        // 更新显示
        const delayElement = document.getElementById('autoGenDelay');
        if (delayElement) {
            delayElement.textContent = `延迟: ${seconds}秒`;
        }
    }
};

console.log('🎹 KeyboardInput自动生成功能扩展已加载');
console.log('🛠️ 调试命令: testKeyboardAutoGeneration()');
console.log('🛠️ 设置延迟: setAutoGenDelay(1.5) // 1.5秒');
console.log('🛠️ 快捷键: Ctrl+G 切换自动生成开/关');
// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyboardInput;
}