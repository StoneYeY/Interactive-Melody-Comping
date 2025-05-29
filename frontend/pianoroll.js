/**
 * PianorollVis.js 简化版
 * 提供钢琴可视化和音符瀑布效果
 */

class NoteVisual {
            constructor(div, animationType = 'waterfall', orientation = 'horizontal', numOctaves = 3, lowestC = 4, width = -1, height = -1, x = 0, y = 0) {
                this.div = div;
                this.animationType = animationType;
                this.orientation = orientation;
                this.numOctaves = numOctaves;
                this.lowestC = lowestC;
                
                // 设置宽度和高度
                this.width = width === -1 ? div.offsetWidth : width;
                this.height = height === -1 ? div.offsetHeight : height;
                this.x = x;
                this.y = y;
                
                // 创建SVG和Canvas元素
                this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                this.svg.setAttribute('width', '100%');
                this.svg.setAttribute('height', '100%');
                
                this.canvas = document.createElement('canvas');
                this.canvas.style.position = 'absolute';
                this.canvas.style.top = '0';
                this.canvas.style.left = '0';
                this.canvas.style.width = '100%';
                this.canvas.style.height = '100%';
                this.canvas.width = this.width;
                this.canvas.height = this.height;
                
                // 添加元素到容器
                this.div.appendChild(this.svg);
                this.div.appendChild(this.canvas);
                
                // 初始化上下文
                this.ctx = this.canvas.getContext('2d');
                
                // 存储活动音符
                this.activeNotes = new Map();
                this.noteElements = new Map();
                
                // 瀑布效果的音符
                this.waterfallNotes = [];
                
                // 初始化钢琴键盘
                this.initPianoKeyboard();
                
                // 设置动画循环
                this.isAnimating = false;
                this.animationId = null;
            }
            
            // 初始化钢琴键盘
            initPianoKeyboard() {
                this.svg.innerHTML = '';
                const svgNS = 'http://www.w3.org/2000/svg';
                
                // 根据方向选择不同的布局
                if (this.orientation === 'horizontal') {
                    this.initHorizontalKeyboard(svgNS);
                } else {
                    this.initVerticalKeyboard(svgNS);
                }
            }
            
            // 初始化水平方向的键盘
            initHorizontalKeyboard(svgNS) {
                const whiteKeyWidth = 30;
                const blackKeyWidth = 20;
                const whiteKeyHeight = 120;
                const blackKeyHeight = 80;
                
                // 计算起始音符
                const startNote = 12 * this.lowestC + 0; // C4 = 60 (MIDI)
                const endNote = startNote + (this.numOctaves * 12);
                
                // 白键位置
                let whiteKeyIndex = 0;
                
                // 绘制白键
                for (let midi = startNote; midi < endNote; midi++) {
                    const noteIndex = midi % 12;
                    
                    // 只绘制白键 (C, D, E, F, G, A, B)
                    if ([0, 2, 4, 5, 7, 9, 11].includes(noteIndex)) {
                        const rect = document.createElementNS(svgNS, 'rect');
                        rect.setAttribute('x', whiteKeyIndex * whiteKeyWidth);
                        rect.setAttribute('y', 0);
                        rect.setAttribute('width', whiteKeyWidth);
                        rect.setAttribute('height', whiteKeyHeight);
                        rect.setAttribute('fill', 'white');
                        rect.setAttribute('stroke', 'black');
                        rect.setAttribute('stroke-width', '1');
                        rect.setAttribute('data-midi', midi);
                        rect.setAttribute('class', 'key white-key');
                        
                        this.svg.appendChild(rect);
                        this.noteElements.set(midi, rect);
                        
                        whiteKeyIndex++;
                    }
                }
                
                // 绘制黑键
                whiteKeyIndex = 0;
                for (let midi = startNote; midi < endNote; midi++) {
                    const noteIndex = midi % 12;
                    
                    // 白键计数
                    if ([0, 2, 4, 5, 7, 9, 11].includes(noteIndex)) {
                        whiteKeyIndex++;
                    }
                    
                    // 只绘制黑键 (C#, D#, F#, G#, A#)
                    if ([1, 3, 6, 8, 10].includes(noteIndex)) {
                        const rect = document.createElementNS(svgNS, 'rect');
                        
                        // 根据前一个白键位置定位黑键
                        let xPos;
                        if (noteIndex === 1) xPos = (whiteKeyIndex - 1) * whiteKeyWidth - blackKeyWidth / 2;
                        else if (noteIndex === 3) xPos = (whiteKeyIndex - 1) * whiteKeyWidth - blackKeyWidth / 2;
                        else if (noteIndex === 6) xPos = (whiteKeyIndex - 1) * whiteKeyWidth - blackKeyWidth / 2;
                        else if (noteIndex === 8) xPos = (whiteKeyIndex - 1) * whiteKeyWidth - blackKeyWidth / 2;
                        else if (noteIndex === 10) xPos = (whiteKeyIndex - 1) * whiteKeyWidth - blackKeyWidth / 2;
                        
                        rect.setAttribute('x', xPos);
                        rect.setAttribute('y', 0);
                        rect.setAttribute('width', blackKeyWidth);
                        rect.setAttribute('height', blackKeyHeight);
                        rect.setAttribute('fill', 'black');
                        rect.setAttribute('data-midi', midi);
                        rect.setAttribute('class', 'key black-key');
                        
                        this.svg.appendChild(rect);
                        this.noteElements.set(midi, rect);
                    }
                }
            }
            
            // 初始化垂直方向的键盘
            initVerticalKeyboard(svgNS) {
                const whiteKeyHeight = 30;
                const blackKeyHeight = 20;
                const whiteKeyWidth = 120;
                const blackKeyWidth = 80;
                
                // 计算起始音符
                const startNote = 12 * this.lowestC + 0; // C4 = 60 (MIDI)
                const endNote = startNote + (this.numOctaves * 12);
                
                // 白键位置
                let whiteKeyIndex = 0;
                
                // 绘制白键
                for (let midi = startNote; midi < endNote; midi++) {
                    const noteIndex = midi % 12;
                    
                    // 只绘制白键 (C, D, E, F, G, A, B)
                    if ([0, 2, 4, 5, 7, 9, 11].includes(noteIndex)) {
                        const rect = document.createElementNS(svgNS, 'rect');
                        rect.setAttribute('y', whiteKeyIndex * whiteKeyHeight);
                        rect.setAttribute('x', 0);
                        rect.setAttribute('height', whiteKeyHeight);
                        rect.setAttribute('width', whiteKeyWidth);
                        rect.setAttribute('fill', 'white');
                        rect.setAttribute('stroke', 'black');
                        rect.setAttribute('stroke-width', '1');
                        rect.setAttribute('data-midi', midi);
                        rect.setAttribute('class', 'key white-key');
                        
                        this.svg.appendChild(rect);
                        this.noteElements.set(midi, rect);
                        
                        whiteKeyIndex++;
                    }
                }
                
                // 绘制黑键
                whiteKeyIndex = 0;
                for (let midi = startNote; midi < endNote; midi++) {
                    const noteIndex = midi % 12;
                    
                    // 白键计数
                    if ([0, 2, 4, 5, 7, 9, 11].includes(noteIndex)) {
                        whiteKeyIndex++;
                    }
                    
                    // 只绘制黑键 (C#, D#, F#, G#, A#)
                    if ([1, 3, 6, 8, 10].includes(noteIndex)) {
                        const rect = document.createElementNS(svgNS, 'rect');
                        
                        // 根据前一个白键位置定位黑键
                        let yPos;
                        if (noteIndex === 1) yPos = (whiteKeyIndex - 1) * whiteKeyHeight - blackKeyHeight / 2;
                        else if (noteIndex === 3) yPos = (whiteKeyIndex - 1) * whiteKeyHeight - blackKeyHeight / 2;
                        else if (noteIndex === 6) yPos = (whiteKeyIndex - 1) * whiteKeyHeight - blackKeyHeight / 2;
                        else if (noteIndex === 8) yPos = (whiteKeyIndex - 1) * whiteKeyHeight - blackKeyHeight / 2;
                        else if (noteIndex === 10) yPos = (whiteKeyIndex - 1) * whiteKeyHeight - blackKeyHeight / 2;
                        
                        rect.setAttribute('y', yPos);
                        rect.setAttribute('x', 0);
                        rect.setAttribute('height', blackKeyHeight);
                        rect.setAttribute('width', blackKeyWidth);
                        rect.setAttribute('fill', 'black');
                        rect.setAttribute('data-midi', midi);
                        rect.setAttribute('class', 'key black-key');
                        
                        this.svg.appendChild(rect);
                        this.noteElements.set(midi, rect);
                    }
                }
            }
            
            // 按下音符
            noteOn(midiNote, color = 'orange') {
                const noteElement = this.noteElements.get(midiNote);
                
                if (noteElement) {
                    // 高亮显示键
                    noteElement.setAttribute('fill', CONSTANTS.COLORS[color]);
                    
                    // 添加到活动音符列表
                    this.activeNotes.set(midiNote, { color, element: noteElement });
                    
                    // 添加瀑布效果
                    this.addWaterfallNote(midiNote, color);
                }
            }
            
            // 释放音符
            noteOff(midiNote) {
                const note = this.activeNotes.get(midiNote);
                
                if (note) {
                    // 恢复原始颜色
                    const isBlackKey = note.element.classList.contains('black-key');
                    note.element.setAttribute('fill', isBlackKey ? 'black' : 'white');
                    
                    // 标记瀑布中的音符已释放
                    this.waterfallNotes.forEach(note => {
                        if (note.midiNote === midiNote && note.active) {
                            note.active = false;
                            note.endTime = Date.now();
                        }
                    });
                    
                    // 从活动音符中移除
                    this.activeNotes.delete(midiNote);
                }
            }
            
            // 添加瀑布效果的音符
            addWaterfallNote(midiNote, color) {
                const noteElement = this.noteElements.get(midiNote);
                
                if (noteElement && this.orientation === 'vertical') {
                    // 获取音符元素位置
                    const x = parseFloat(noteElement.getAttribute('x'));
                    const y = parseFloat(noteElement.getAttribute('y'));
                    const width = parseFloat(noteElement.getAttribute('width'));
                    const height = parseFloat(noteElement.getAttribute('height'));
                    
                    // 添加到瀑布音符列表
                    this.waterfallNotes.push({
                        midiNote,
                        x: x + width, // 在键盘右侧开始
                        y: y + height / 2, // 键盘的中点
                        width: 0,
                        height: height * 0.7, // 略小于键盘高度
                        color: CONSTANTS.COLORS[color],
                        startTime: Date.now(),
                        endTime: null,
                        active: true
                    });
                } else if (noteElement && this.orientation === 'horizontal') {
                    // 获取音符元素位置
                    const x = parseFloat(noteElement.getAttribute('x'));
                    const y = parseFloat(noteElement.getAttribute('y'));
                    const width = parseFloat(noteElement.getAttribute('width'));
                    const height = parseFloat(noteElement.getAttribute('height'));
                    
                    // 添加到瀑布音符列表
                    this.waterfallNotes.push({
                        midiNote,
                        x: x + width / 2, // 键盘的中点
                        y: y + height, // 在键盘底部开始
                        width: width * 0.7, // 略小于键盘宽度
                        height: 0,
                        color: CONSTANTS.COLORS[color],
                        startTime: Date.now(),
                        endTime: null,
                        active: true
                    });
                }
            }
            
            // 开始瀑布动画
            start() {
                if (!this.isAnimating) {
                    this.isAnimating = true;
                    this.animate();
                }
            }
            
            // 停止瀑布动画
            stop() {
                this.isAnimating = false;
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }
                
                // 清除画布
                this.clear();
            }
            
            // 清除所有内容
            clear() {
                // 清除画布
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                
                // 重置所有音符颜色
                this.noteElements.forEach((element, midi) => {
                    const isBlackKey = element.classList.contains('black-key');
                    element.setAttribute('fill', isBlackKey ? 'black' : 'white');
                });
                
                // 清除活动音符和瀑布音符
                this.activeNotes.clear();
                this.waterfallNotes = [];
            }
            
            // 动画循环
            animate() {
                if (!this.isAnimating) return;
                
                // 清除画布
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                
                // 更新和绘制瀑布音符
                if (this.orientation === 'vertical') {
                    this.drawVerticalWaterfall();
                } else {
                    this.drawHorizontalWaterfall();
                }
                
                // 继续下一帧
                this.animationId = requestAnimationFrame(() => this.animate());
            }
            
            // 绘制水平方向的瀑布效果
            drawHorizontalWaterfall() {
                const now = Date.now();
                const speed = 2; // 速度因子
                
                // 保留窗口内的音符
                this.waterfallNotes = this.waterfallNotes.filter(note => {
                    // 如果音符还在活动或者在可见范围内
                    return note.active || note.y < this.height + 100;
                });
                
                // 更新和绘制每个音符
                this.waterfallNotes.forEach(note => {
                    if (note.active) {
                        // 如果音符还在活动，增加高度
                        note.height += speed;
                    } else {
                        // 如果音符已释放，向下移动
                        note.y += speed;
                    }
                    
                    // 计算透明度
                    const alpha = 1 - (note.y - 120) / (this.height - 120);
                    
                    // 绘制音符
                    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                    this.ctx.fillStyle = note.color;
                    this.ctx.fillRect(note.x - note.width / 2, note.y - note.height, note.width, note.height);
                });
                
                // 重置透明度
                this.ctx.globalAlpha = 1;
            }
            
            // 绘制垂直方向的瀑布效果
            drawVerticalWaterfall() {
                const now = Date.now();
                const speed = 2; // 速度因子
                
                // 保留窗口内的音符
                this.waterfallNotes = this.waterfallNotes.filter(note => {
                    // 如果音符还在活动或者在可见范围内
                    return note.active || note.x < this.width + 100;
                });
                
                // 更新和绘制每个音符
                this.waterfallNotes.forEach(note => {
                    if (note.active) {
                        // 如果音符还在活动，增加宽度
                        note.width += speed;
                    } else {
                        // 如果音符已释放，向右移动
                        note.x += speed;
                    }
                    
                    // 计算透明度
                    const alpha = 1 - (note.x - 120) / (this.width - 120);
                    
                    // 绘制音符
                    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                    this.ctx.fillStyle = note.color;
                    this.ctx.fillRect(note.x - note.width, note.y - note.height / 2, note.width, note.height);
                });
                
                // 重置透明度
                this.ctx.globalAlpha = 1;
            }
        }
        
        class DrawLoop {
            constructor(fps = 60) {
                this.fps = fps;
                this.interval = 1000 / fps;
                this.lastTime = 0;
                this.drawFunctions = [];
                this.isRunning = false;
                this.animationId = null;
            }
            
            addDrawFunctionFromVisual(visual) {
                this.drawFunctions.push(() => {
                    // 这个函数不需要做任何事，因为NoteVisual已经有自己的动画循环
                    // 但我们保留这个方法来兼容原始API
                });
            }
            
            startDrawLoop() {
                if (!this.isRunning) {
                    this.isRunning = true;
                    this.animate();
                }
            }
            
            animate(time = 0) {
                if (!this.isRunning) return;
                
                const elapsed = time - this.lastTime;
                
                if (elapsed > this.interval) {
                    this.lastTime = time - (elapsed % this.interval);
                    
                    // 执行所有绘制函数
                    this.drawFunctions.forEach(fn => fn());
                }
                
                this.animationId = requestAnimationFrame(time => this.animate(time));
            }
        }