# backend/server.py

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
import json
import argparse
import torch
import numpy as np
import math

# 添加当前目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 导入项目的核心模型文件
try:
    from Model.Transformer import Transformer
    from song_dataloader import Song_Dataloader

    print("✅ 成功导入模型相关模块")
except ImportError as e:
    print(f"❌ 导入模型模块失败: {e}")
    print("💡 请确保你在项目根目录运行，并且所有依赖已安装")
    sys.exit(1)

app = Flask(__name__)

# CORS 配置
CORS(app,
     origins=["*"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "Access-Control-Allow-Credentials"],
     supports_credentials=True)


@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response


# 全局变量
harmony_model = None
loader = None
device = None
chord2in = None
in2chord = None
note2in = None
in2note = None

def inspect_vocabulary():
    """Inspect vocabulary structure"""
    global note2in, in2note, chord2in, in2chord

    print("🔍 Vocabulary structure inspection:")

    if note2in:
        note_keys = list(note2in.keys())[:10]
        note_values = list(note2in.values())[:10]
        print(f"   Note vocabulary sample (key->value): {dict(list(note2in.items())[:5])}")
        print(f"   Note key type: {type(note_keys[0]) if note_keys else 'empty'}")
        print(f"   Note value type: {type(note_values[0]) if note_values else 'empty'}")

    if chord2in:
        chord_keys = list(chord2in.keys())[:10]
        chord_values = list(chord2in.values())[:10]
        print(f"   Chord vocabulary sample (key->value): {dict(list(chord2in.items())[:5])}")
        print(f"   Chord key type: {type(chord_keys[0]) if chord_keys else 'empty'}")
        print(f"   Chord value type: {type(chord_values[0]) if chord_values else 'empty'}")

    if in2note:
        print(f"   Reverse note vocabulary sample: {dict(list(in2note.items())[:5])}")

    if in2chord:
        print(f"   Reverse chord vocabulary sample: {dict(list(in2chord.items())[:5])}")


def load_model():
    """Load pre-trained Transformer model"""
    global harmony_model, loader, device, chord2in, in2chord, note2in, in2note

    print("🚀 Starting to load full Transformer model...")

    # Set device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"🖥️  Using device: {device}")

    try:
        # 1. Load dataset and vocabulary
        print("📊 Loading dataset and vocabulary...")
        loader = Song_Dataloader()
        train_dataloader, test_dataloader, chord2in, in2chord, note2in, in2note = loader.load()

        print(f"   Note vocabulary size: {len(note2in)}")
        print(f"   Chord vocabulary size: {len(chord2in)}")

        # Check vocabulary structure
        inspect_vocabulary()

        # 2. Load pre-trained model
        model_path = 'Saved_Models/pretrained_model.pth'
        if not os.path.exists(model_path):
            print(f"❌ Model file not found: {model_path}")
            # Try fallback path
            model_path = 'Saved_Models/trained_model.pth'
            if not os.path.exists(model_path):
                raise FileNotFoundError("Model file not found, please ensure the model has been trained and saved")

        print(f"📥 Loading model: {model_path}")
        main_model = torch.load(model_path, map_location=device)

        # 3. Parse model information
        model_kwargs, model_state, model_type = main_model['model']

        # 4. Instantiate model
        print("🔧 Instantiating Transformer model...")
        print(f"📋 Model parameters: {model_kwargs}")

        harmony_model = Transformer(**model_kwargs)
        harmony_model.load_state_dict(model_state)
        harmony_model = harmony_model.to(device)
        harmony_model.eval()  # Set to evaluation mode

        # 5. Print model info
        total_params = sum(p.numel() for p in harmony_model.parameters())
        print(f"🧠 Total model parameters: {total_params:,}")
        print(f"📋 Model type: {model_type}")
        print("✅ Transformer model loaded successfully!")

        return True

    except Exception as e:
        print(f"❌ Model loading failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def generate_with_transformer(model, src_sequence, max_new_tokens=10, temperature=1.0, top_k=20, start_token=1,
                              pad_token=0):
    """
    使用你的 Transformer 模型生成序列

    Args:
        model: 你的 Transformer 模型
        src_sequence: 源序列 (音符) [batch_size, seq_len]
        max_new_tokens: 最大生成的新token数量
        temperature: 温度参数
        top_k: top-k采样
        start_token: 开始token的ID
        pad_token: 填充token的ID
    """
    model.eval()
    device = next(model.parameters()).device

    # 确保输入在正确的设备上
    src_sequence = src_sequence.to(device)
    batch_size = src_sequence.size(0)

    # 初始化目标序列，从start_token开始
    tgt_sequence = torch.full((batch_size, 1), start_token, dtype=torch.long, device=device)

    print(f"🔮 开始生成，源序列形状: {src_sequence.shape}, 初始目标序列: {tgt_sequence.shape}")

    with torch.no_grad():
        for step in range(max_new_tokens):
            # 创建目标mask
            tgt_len = tgt_sequence.size(1)
            tgt_mask = model.get_tgt_mask(tgt_len).to(device)

            try:
                # 前向传播
                outputs = model(src_sequence, tgt_sequence, tgt_mask=tgt_mask)

                # 获取最后一个时间步的logits
                next_token_logits = outputs[:, -1, :] / temperature

                # Top-k 采样
                if top_k > 0:
                    # 获取每个样本的top-k
                    top_k_logits, top_k_indices = torch.topk(next_token_logits, min(top_k, next_token_logits.size(-1)))

                    # 创建mask，只保留top-k的值
                    filtered_logits = torch.full_like(next_token_logits, float('-inf'))
                    filtered_logits.scatter_(-1, top_k_indices, top_k_logits)
                    next_token_logits = filtered_logits

                # 应用softmax得到概率分布
                probs = torch.softmax(next_token_logits, dim=-1)

                # 从分布中采样
                next_token = torch.multinomial(probs, num_samples=1)

                # 将新token添加到目标序列
                tgt_sequence = torch.cat([tgt_sequence, next_token], dim=-1)

                print(f"   步骤 {step + 1}: 生成token {next_token.squeeze().cpu().tolist()}")

            except Exception as e:
                print(f"⚠️  生成步骤 {step} 出错: {e}")
                break

    print(f"✅ 生成完成，最终序列形状: {tgt_sequence.shape}")
    return tgt_sequence


def midi_to_note_name(midi_number):
    """将MIDI数字转换为音符名称（如 60 -> C4）"""
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    octave = midi_number // 12 - 1
    note_index = midi_number % 12
    return f"{note_names[note_index]}{octave}"


def note_name_to_midi(note_name):
    """将音符名称转换为MIDI数字（如 C4 -> 60）"""
    try:
        # 解析音符名称，如 "C4", "C#4", "Bb3"
        import re
        match = re.match(r'([A-G][#b]?)(-?\d+)', note_name)
        if not match:
            return None

        note_part, octave_part = match.groups()
        octave = int(octave_part)

        note_map = {
            'C': 0, 'C#': 1, 'Db': 1,
            'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4,
            'F': 5, 'F#': 6, 'Gb': 6,
            'G': 7, 'G#': 8, 'Ab': 8,
            'A': 9, 'A#': 10, 'Bb': 10,
            'B': 11
        }

        if note_part in note_map:
            return (octave + 1) * 12 + note_map[note_part]
        return None
    except:
        return None


def convert_midi_to_vocab_index(midi_note, note2in, in2note):
    """
    安全地将MIDI音符转换为词汇表索引
    支持多种词汇表格式
    """
    print(f"🔍 转换MIDI {midi_note} 到词汇表索引...")

    # 方法1: 直接查找MIDI数字
    if midi_note in note2in:
        result = note2in[midi_note]
        print(f"   ✅ 直接找到MIDI {midi_note} -> 索引 {result}")
        return result

    # 方法2: 查找MIDI数字的字符串版本
    midi_str = str(midi_note)
    if midi_str in note2in:
        result = note2in[midi_str]
        print(f"   ✅ 字符串查找成功 '{midi_str}' -> 索引 {result}")
        return result

    # 方法3: 转换为音符名称再查找
    note_name = midi_to_note_name(midi_note)
    if note_name in note2in:
        result = note2in[note_name]
        print(f"   ✅ 音符名称查找成功 '{note_name}' -> 索引 {result}")
        return result

    # 方法4: 寻找最相似的键
    print(f"   ⚠️  尝试寻找最相似的键...")
    available_keys = list(note2in.keys())

    # 首先尝试找到所有可能的MIDI值
    possible_matches = []

    for key in available_keys:
        try:
            # 尝试直接转换为整数
            if isinstance(key, (int, float)):
                possible_matches.append((key, int(key)))
            elif isinstance(key, str):
                if key.isdigit():
                    # 纯数字字符串
                    possible_matches.append((key, int(key)))
                else:
                    # 尝试作为音符名称解析
                    midi_val = note_name_to_midi(key)
                    if midi_val is not None:
                        possible_matches.append((key, midi_val))
        except:
            continue

    if possible_matches:
        # 找到最接近的MIDI值
        closest_key, closest_midi = min(possible_matches, key=lambda x: abs(x[1] - midi_note))
        result = note2in[closest_key]
        print(f"   ✅ 找到最接近的 '{closest_key}' (MIDI {closest_midi}) -> 索引 {result}")
        return result

    # 方法5: 如果所有方法都失败，使用第一个可用的键
    if available_keys:
        fallback_key = available_keys[0]
        result = note2in[fallback_key]
        print(f"   ⚠️  使用后备键 '{fallback_key}' -> 索引 {result}")
        return result

    # 最后的后备方案
    print(f"   ❌ 所有方法都失败，使用索引 0")
    return 0


def enhance_chords_with_sevenths(chord_sequence, melody_midi_notes, enhancement_probability=0.7):
    """
    智能地将三和弦转换为七和弦

    Args:
        chord_sequence: AI模型生成的和弦序列 ['G', 'D', 'C']
        melody_midi_notes: 原始旋律的MIDI音符 [64, 67, 60]
        enhancement_probability: 转换为七和弦的概率 (0.0-1.0)

    Returns:
        增强后的和弦序列 ['Gmaj7', 'D7', 'Cmaj7']
    """
    import random

    print(f"🎨 开始增强和弦序列: {chord_sequence}")

    enhanced_chords = []

    # 分析旋律的调性（简化版）
    melody_key = analyze_melody_key(melody_midi_notes)
    print(f"🎼 检测到的调性: {melody_key}")

    for i, chord in enumerate(chord_sequence):
        # 检查是否为简单三和弦（没有数字或修饰符）
        if is_simple_triad(chord):
            # 决定是否增强这个和弦
            if random.random() < enhancement_probability:
                enhanced_chord = suggest_seventh_chord(chord, i, len(chord_sequence), melody_key)
                enhanced_chords.append(enhanced_chord)
                print(f"   ✨ 增强: {chord} → {enhanced_chord}")
            else:
                enhanced_chords.append(chord)
                print(f"   ➡️  保持: {chord}")
        else:
            # 已经是复杂和弦，保持不变
            enhanced_chords.append(chord)
            print(f"   ✅ 复杂和弦保持: {chord}")

    print(f"🎉 增强完成: {enhanced_chords}")
    return enhanced_chords


def is_simple_triad(chord):
    """检查是否为简单三和弦"""
    # 简单三和弦模式：C, Cm, D, F#, Bb 等
    # 不包含数字(7, 9, 11等)或复杂修饰符
    import re

    # 移除空格
    chord = chord.strip()

    # 匹配简单三和弦模式
    simple_patterns = [
        r'^[A-G][#b]?$',  # C, D#, Bb
        r'^[A-G][#b]?m$',  # Cm, F#m, Bbm
        r'^[A-G][#b]?M$',  # CM (大写M表示大调)
        r'^[A-G][#b]?maj$',  # Cmaj
        r'^[A-G][#b]?min$',  # Cmin
        r'^[A-G][#b]?dim$',  # Cdim
        r'^[A-G][#b]?aug$',  # Caug
    ]

    for pattern in simple_patterns:
        if re.match(pattern, chord):
            return True

    return False


def suggest_seventh_chord(basic_chord, position, total_chords, key='C'):
    """
    根据和弦在进行中的位置和调性，建议合适的七和弦

    Args:
        basic_chord: 基本三和弦 'G'
        position: 在和弦进行中的位置 (0, 1, 2...)
        total_chords: 总和弦数量
        key: 调性

    Returns:
        建议的七和弦 'G7' 或 'Gmaj7'
    """

    # 和弦根音提取
    root = extract_chord_root(basic_chord)
    chord_quality = extract_chord_quality(basic_chord)

    # 根据功能和位置决定七和弦类型
    seventh_type = decide_seventh_type(root, chord_quality, position, total_chords, key)

    # 构建最终和弦
    if chord_quality == 'minor':
        result = f"{root}m7"
    elif chord_quality == 'diminished':
        result = f"{root}dim7"
    elif chord_quality == 'augmented':
        result = f"{root}aug7"
    else:  # major
        result = f"{root}{seventh_type}"

    return result


def extract_chord_root(chord):
    """提取和弦根音"""
    import re
    match = re.match(r'([A-G][#b]?)', chord)
    return match.group(1) if match else 'C'


def extract_chord_quality(chord):
    """提取和弦性质"""
    chord_lower = chord.lower()
    if 'm' in chord_lower or 'min' in chord_lower:
        return 'minor'
    elif 'dim' in chord_lower:
        return 'diminished'
    elif 'aug' in chord_lower:
        return 'augmented'
    else:
        return 'major'


def decide_seventh_type(root, quality, position, total_chords, key):
    """
    决定使用哪种七和弦

    音乐理论规则：
    - 属和弦（V级）通常用属七和弦 (7)
    - 主和弦（I级）通常用大七和弦 (maj7)
    - 下属和弦（IV级）通常用大七和弦 (maj7)
    - 小调和弦通常用小七和弦 (m7)
    - 结束位置倾向于稳定的大七和弦
    """

    # 简化的功能分析
    key_center = key[0] if key else 'C'  # 提取调性主音

    # 计算根音与调性主音的关系
    note_circle = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    try:
        key_idx = note_circle.index(key_center)
        root_clean = root.replace('#', '#').replace('b', 'b')  # 标准化

        # 处理异名同音
        if root_clean == 'Db' and 'C#' in note_circle:
            root_clean = 'C#'
        elif root_clean == 'Eb' and 'D#' in note_circle:
            root_clean = 'D#'
        # 可以添加更多异名同音处理

        if root_clean in note_circle:
            root_idx = note_circle.index(root_clean)
            interval = (root_idx - key_idx) % 12
        else:
            interval = 0  # 默认
    except:
        interval = 0

    # 根据音程关系决定七和弦类型
    if interval == 7:  # 属音（V级）
        return '7'  # 属七和弦
    elif interval == 0:  # 主音（I级）
        if quality == 'minor':
            return 'm7'
        else:
            return 'maj7'  # 主大七和弦
    elif interval == 5:  # 下属音（IV级）
        if quality == 'minor':
            return 'm7'
        else:
            return 'maj7'  # 下属大七和弦
    elif quality == 'minor':
        return 'm7'  # 小七和弦
    elif position == total_chords - 1:  # 最后一个和弦
        return 'maj7'  # 稳定的结束
    else:
        # 默认规则
        if quality == 'minor':
            return 'm7'
        else:
            # 随机选择增加变化
            import random
            return random.choice(['maj7', '7']) if random.random() < 0.6 else 'maj7'


def analyze_melody_key(midi_notes):
    """
    简单的调性分析
    基于旋律音符的出现频率
    """
    if not midi_notes:
        return 'C'

    # 统计各个音符的出现次数
    note_counts = {}
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    for midi_note in midi_notes:
        note_name = note_names[midi_note % 12]
        note_counts[note_name] = note_counts.get(note_name, 0) + 1

    # 找到最常出现的音符作为可能的调性中心
    if note_counts:
        most_common_note = max(note_counts, key=note_counts.get)
        return most_common_note

    return 'C'  # 默认C调


# 替换 harmonize_melody_transformer 函数中的解码部分
def calculate_smart_chord_length(melody_length):
    """
    根据旋律长度智能计算应该生成多少个和弦

    Args:
        melody_length: 旋律中音符的数量

    Returns:
        应该生成的和弦数量
    """
    if melody_length <= 2:
        return 1  # 1-2个音符 → 1个和弦
    elif melody_length <= 4:
        return 2  # 3-4个音符 → 2个和弦
    elif melody_length <= 8:
        return max(2, melody_length // 2)  # 5-8个音符 → 2-4个和弦
    elif melody_length <= 16:
        return max(3, melody_length // 3)  # 9-16个音符 → 3-5个和弦
    else:
        return min(melody_length // 4 + 2, 8)  # 长旋律最多8个和弦


def harmonize_melody_transformer(melody, temperature=1.0, k=20):
    """简化版：直接使用 Transformer 模型生成和弦，相信模型判断"""
    global harmony_model, device, chord2in, in2chord, note2in, in2note

    if harmony_model is None:
        raise Exception("模型未加载")

    try:
        print(f"🎵 使用 Transformer 模型处理旋律: {melody}")

        # 1. 提取MIDI音符
        midi_notes = [note_dur[0] for note_dur in melody]
        print(f"📝 MIDI音符序列: {midi_notes}")

        # 2. 转换MIDI到模型词汇
        note_indices = []
        for i, midi_note in enumerate(midi_notes):
            try:
                index = convert_midi_to_vocab_index(midi_note, note2in, in2note)
                note_indices.append(index)
                print(f"   音符 {i + 1}: MIDI {midi_note} -> 索引 {index}")
            except Exception as e:
                print(f"   ❌ 转换音符 {midi_note} 失败: {e}")
                note_indices.append(1)  # 安全默认值

        if not note_indices:
            raise Exception("无法转换任何输入音符到词汇表索引")

        # 3. 准备模型输入
        src_sequence = torch.tensor([note_indices], dtype=torch.long).to(device)
        print(f"📊 源序列张量形状: {src_sequence.shape}")

        # 4. ✅ 智能生成长度
        smart_length = calculate_smart_chord_length(len(melody))
        print(f"🧠 智能长度计算: {len(melody)}个音符 → {smart_length}个和弦")

        # 5. 确定特殊token
        start_token = 1
        pad_token = 0

        # 尝试找到真实的特殊token
        for token_name in ['<START>', '<start>', 'START', '<SOS>', '<BOS>']:
            if token_name in chord2in:
                start_token = chord2in[token_name]
                break

        for token_name in ['<PAD>', '<pad>', 'PAD', '<UNK>']:
            if token_name in chord2in:
                pad_token = chord2in[token_name]
                break

        print(f"🎯 使用开始token: {start_token}, 填充token: {pad_token}")

        # 6. ✅ 生成和弦序列
        print("🧠 开始使用Transformer生成和弦...")
        generated_sequence = generate_with_transformer(
            model=harmony_model,
            src_sequence=src_sequence,
            max_new_tokens=smart_length,  # ✅ 使用智能长度
            temperature=temperature,
            top_k=k,
            start_token=start_token,
            pad_token=pad_token
        )

        print(f"🔮 生成的序列: {generated_sequence[0].cpu().tolist()}")

        # 7. ✅ 简洁的解码 - 只做基本清理，不改变音乐内容
        generated_chord_indices = generated_sequence[0][1:].cpu().numpy()  # 跳过start token
        chords = []

        # 定义要过滤的特殊标记
        special_tokens = {
            '<PAD>', '<START>', '<END>', '<UNK>', '<MASK>', '<SOS>', '<EOS>', '<BOS>',
            '<pad>', '<start>', '<end>', '<unk>', '<mask>', '<sos>', '<eos>', '<bos>',
            'PAD', 'START', 'END', 'UNK', 'MASK', 'SOS', 'EOS', 'BOS'
        }

        print("🎹 开始解码和弦:")
        for i, chord_idx in enumerate(generated_chord_indices):
            chord_idx_int = int(chord_idx)

            if chord_idx_int in in2chord:
                chord_name = in2chord[chord_idx_int]
                print(f"   检查 {i + 1}: 索引 {chord_idx} -> '{chord_name}'")

                # ✅ 只过滤特殊标记和明显错误，不做音乐性修改
                if chord_name not in special_tokens:
                    # 只修复明显的格式错误
                    cleaned_chord = clean_chord_format(chord_name)
                    chords.append(cleaned_chord)
                    print(f"   ✅ 接受和弦: '{cleaned_chord}'")

                    # 如果遇到结束标记，停止解码
                    if chord_name.upper() in {'<EOS>', 'EOS', '<END>', 'END'}:
                        print(f"   🛑 遇到结束标记，停止解码")
                        break
                else:
                    print(f"   🚫 跳过特殊token: '{chord_name}'")
            else:
                print(f"   ⚠️  未知索引 {chord_idx}")

        # 8. ✅ 最终处理 - 确保有结果，但不强制修改
        if not chords:
            print("⚠️  模型未生成有效和弦，使用基于输入的简单备用方案...")
            chords = generate_fallback_chords(midi_notes)

        # 限制长度但保持模型的选择
        final_chords = chords[:smart_length] if chords else ['Cmaj7']

        print(f"🎼 最终和弦序列: {final_chords}")
        # 🎼 添加时间信息分析（在return之前）
        print(f"\n🎼 ===== 详细时间信息 =====")

        # 分析旋律时间结构
        total_duration = sum(note_dur[1] for note_dur in melody)
        print(f"📝 输入旋律分析:")
        print(f"   总时长: {total_duration} 个16分音符 ({total_duration * 0.125:.2f}秒 @ 120BPM)")
        print(f"   音符数: {len(melody)}")

        position = 0
        for i, note_dur in enumerate(melody):
            note, duration = note_dur[0], note_dur[1]
            start_time = position * 0.125
            end_time = (position + duration) * 0.125
            print(f"   音符 {i + 1}: {note} ({position}-{position + duration}, {start_time:.2f}s-{end_time:.2f}s)")
            position += duration

        # 分析和弦时间分配
        print(f"\n🎵 生成的和弦时间分配:")
        chord_count = len(final_chords)
        if chord_count > 0:
            chord_duration = total_duration / chord_count

            for i, chord in enumerate(final_chords):
                start_pos = i * chord_duration
                end_pos = (i + 1) * chord_duration
                start_time = start_pos * 0.125
                end_time = end_pos * 0.125

                print(f"   和弦 {i + 1}: {chord}")
                print(f"      位置: {start_pos:.1f}-{end_pos:.1f} (16分音符)")
                print(f"      时间: {start_time:.2f}s-{end_time:.2f}s")
                print(f"      持续: {(end_time - start_time):.2f}s")

        print(f"=============================\n")

        # 然后正常 return final_chords
        return final_chords

    except Exception as e:
        print(f"❌ Transformer 处理失败: {str(e)}")
        import traceback
        traceback.print_exc()
        print("🔄 回退到简单规则...")
        return harmonize_melody_simple(melody, temperature, k)


def clean_chord_format(chord_name):
    """只修复明显的格式错误，不改变音乐内容"""
    if not chord_name or not isinstance(chord_name, str):
        return 'C'

    chord = chord_name.strip()

    # 只修复明显的双字母错误
    if 'mm' in chord and not 'dim' in chord:  # 避免影响dim和弦
        chord = chord.replace('mm', 'm')  # Dmm7 -> Dm7

    # 移除明显的无效字符，但保持音乐符号
    import re
    if not re.match(r'^[A-G][#b]?', chord):
        return 'C'  # 如果开头不是音符，返回默认

    return chord

def generate_chords_from_notes_smart(midi_notes):
    """基于MIDI音符生成智能和弦的方法"""
    if not midi_notes:
        return ['Cmaj7', 'Dm7', 'G7']

    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    # 分析音符分布
    note_counts = {}
    for midi_note in midi_notes:
        note_name = note_names[midi_note % 12]
        note_counts[note_name] = note_counts.get(note_name, 0) + 1

    # 找到主要音符
    primary_notes = sorted(note_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    print(f"🔍 主要音符分析: {primary_notes}")

    # 基于主要音符构建和弦进行
    chords = []
    for note, count in primary_notes:
        # 根据音符构建合适的和弦
        if note in ['C', 'F', 'G']:
            chords.append(f"{note}maj7")
        elif note in ['D', 'E', 'A', 'B']:
            chords.append(f"{note}m7")
        else:
            chords.append(f"{note}7")

    # 确保至少有两个和弦
    if len(chords) < 2:
        chords.append('G7')  # 添加属和弦

    return chords[:3]  # 返回最多3个和弦


def standardize_chord_name(chord_name):
    """
    标准化和弦名称，修复常见的错误

    Args:
        chord_name: 原始和弦名称 'Amm7', 'Dmm', 'G#m7' 等

    Returns:
        标准化的和弦名称 'Am7', 'Dm', 'G#m7' 等
    """
    if not chord_name or not isinstance(chord_name, str):
        return 'C'

    # 移除多余的空格
    chord = chord_name.strip()

    # 如果是特殊标记，返回默认和弦
    special_tokens = ['<EOS>', '<SOS>', '<PAD>', '<UNK>', '<MASK>', '<START>', '<END>']
    if chord in special_tokens or (chord.startswith('<') and chord.endswith('>')):
        return 'C'

    # 修复常见的错误模式
    fixes = [
        # 双m问题：Amm7 -> Am7, Dmm -> Dm
        (r'([A-G][#b]?)mm(\d*)', lambda m: f"{m.group(1)}m{m.group(2) if m.group(2) else '7'}"),

        # 重复的修饰符：C##7 -> C#7, Bbb -> Bb
        (r'([A-G])##', r'\1#'),
        (r'([A-G])bb', r'\1b'),

        # 标准化maj表示法：CM -> Cmaj, C_maj -> Cmaj
        (r'([A-G][#b]?)M(\d*)', r'\1maj\2'),
        (r'([A-G][#b]?)_maj', r'\1maj'),

        # 标准化min表示法：Cmin -> Cm, C_min -> Cm
        (r'([A-G][#b]?)min(\d*)', r'\1m\2'),
        (r'([A-G][#b]?)_min', r'\1m'),

        # 修复异常的数字位置：C7m -> Cm7
        (r'([A-G][#b]?)(\d+)m', r'\1m\2'),

        # 标准化增减和弦：Caug -> C+, Cdim -> C°
        (r'([A-G][#b]?)aug', r'\1+'),
        (r'([A-G][#b]?)dim', r'\1°'),

        # 移除无效字符
        (r'[^\w#b+°]', ''),
    ]

    import re
    for pattern, replacement in fixes:
        chord = re.sub(pattern, replacement, chord)

    # 验证和弦名称的基本格式
    if not re.match(r'^[A-G][#b]?', chord):
        print(f"⚠️  无效的和弦名称格式: '{chord_name}' -> 使用默认 'C'")
        return 'C'

    # 如果修复后与原来不同，记录
    if chord != chord_name:
        print(f"🔧 和弦名称修复: '{chord_name}' -> '{chord}'")

    return chord


def validate_chord_quality(chord):
    """验证和弦是否为有效的音乐和弦"""

    # 提取根音
    import re
    root_match = re.match(r'^([A-G][#b]?)', chord)
    if not root_match:
        return False

    root = root_match.group(1)
    suffix = chord[len(root):]

    # 有效的和弦后缀
    valid_suffixes = [
        '', 'maj', 'm', 'min',  # 基本三和弦
        '7', 'maj7', 'm7', 'min7',  # 七和弦
        'dim', 'dim7', '°', '°7',  # 减和弦
        'aug', '+', '+7',  # 增和弦
        '9', 'maj9', 'm9',  # 九和弦
        '11', '13',  # 延伸和弦
        'sus2', 'sus4',  # 挂留和弦
        '6', 'm6', 'maj6',  # 六和弦
        'add9', 'add11'  # 加音和弦
    ]

    return suffix in valid_suffixes


def enhance_chord_sequence_with_validation(chord_sequence):
    """
    增强和弦序列，包括名称标准化和质量验证
    """
    enhanced_sequence = []

    print(f"🔧 开始验证和修复和弦序列: {chord_sequence}")

    for i, chord in enumerate(chord_sequence):
        # 1. 标准化和弦名称
        standardized_chord = standardize_chord_name(chord)

        # 2. 验证和弦质量
        if validate_chord_quality(standardized_chord):
            enhanced_sequence.append(standardized_chord)
            print(f"   ✅ 和弦 {i + 1}: '{chord}' -> '{standardized_chord}' (有效)")
        else:
            # 3. 如果无效，尝试智能修复
            fixed_chord = suggest_valid_chord_alternative(standardized_chord)
            enhanced_sequence.append(fixed_chord)
            print(f"   🔧 和弦 {i + 1}: '{chord}' -> '{fixed_chord}' (修复)")

    # 4. 确保序列不为空
    if not enhanced_sequence:
        enhanced_sequence = ['Cmaj7']
        print(f"   ⚠️  序列为空，使用默认: {enhanced_sequence}")

    print(f"✅ 验证完成: {enhanced_sequence}")
    return enhanced_sequence


def suggest_valid_chord_alternative(invalid_chord):
    """为无效和弦建议有效的替代方案"""

    # 提取根音
    import re
    root_match = re.match(r'^([A-G][#b]?)', invalid_chord)
    if root_match:
        root = root_match.group(1)

        # 根据根音的特点建议合适的和弦
        root_note_idx = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
                         'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}

        if root in root_note_idx:
            idx = root_note_idx[root]

            # 根据音程特点选择和弦类型
            if idx in [0, 5, 7]:  # C, F, G - 常用的大调和弦
                return f"{root}maj7"
            elif idx in [2, 4, 9]:  # D, E, A - 常用的小调和弦
                return f"{root}m7"
            else:
                return f"{root}7"  # 其他用属七和弦

    # 如果无法提取根音，返回默认
    return 'Cmaj7'


# 在 harmonize_melody_transformer 函数中集成验证
def integrate_chord_validation_in_transformer(basic_chords):
    """在 Transformer 函数中集成和弦验证"""

    print(f"🎼 原始AI生成的和弦: {basic_chords}")

    # 1. 标准化和验证和弦名称
    validated_chords = enhance_chord_sequence_with_validation(basic_chords)

    # 2. 确保和弦进行的音乐合理性
    if len(validated_chords) > 1:
        validated_chords = ensure_musical_progression(validated_chords)

    return validated_chords


def ensure_musical_progression(chord_sequence):
    """确保和弦进行符合基本的音乐逻辑"""

    # 如果和弦进行中有太多相同的和弦，增加变化
    if len(set(chord_sequence)) == 1 and len(chord_sequence) > 1:
        root_chord = chord_sequence[0]
        root = extract_chord_root(root_chord)

        # 创建简单的 I-vi-IV-V 进行
        progressions = {
            'C': ['Cmaj7', 'Am7', 'Fmaj7', 'G7'],
            'G': ['Gmaj7', 'Em7', 'Cmaj7', 'D7'],
            'D': ['Dmaj7', 'Bm7', 'Gmaj7', 'A7'],
            'A': ['Amaj7', 'F#m7', 'Dmaj7', 'E7'],
            'E': ['Emaj7', 'C#m7', 'Amaj7', 'B7'],
            'F': ['Fmaj7', 'Dm7', 'Bbmaj7', 'C7'],
        }

        if root in progressions:
            prog = progressions[root]
            result = prog[:len(chord_sequence)]
            print(f"🎵 优化重复和弦进行: {chord_sequence} -> {result}")
            return result

    return chord_sequence

# 🆕 更新 is_simple_triad 函数，避免将 <EOS> 认为是复杂和弦
def is_simple_triad(chord):
    """检查是否为简单三和弦"""
    import re

    # 移除空格
    chord = chord.strip()

    # 🆕 如果是特殊标记，直接返回 False
    special_tokens = ['<EOS>', '<SOS>', '<PAD>', '<UNK>', '<MASK>', '<START>', '<END>']
    if chord in special_tokens or chord.startswith('<') and chord.endswith('>'):
        return False

    # 匹配简单三和弦模式
    simple_patterns = [
        r'^[A-G][#b]?$',  # C, D#, Bb
        r'^[A-G][#b]?m$',  # Cm, F#m, Bbm
        r'^[A-G][#b]?M$',  # CM (大写M表示大调)
        r'^[A-G][#b]?maj$',  # Cmaj
        r'^[A-G][#b]?min$',  # Cmin
        r'^[A-G][#b]?dim$',  # Cdim
        r'^[A-G][#b]?aug$',  # Caug
    ]

    for pattern in simple_patterns:
        if re.match(pattern, chord):
            return True

    return False
def generate_chords_from_notes(midi_notes):
    """基于MIDI音符生成简单和弦的备用方法"""
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    chord_progressions = {
        'C': ['Cmaj7', 'Am7', 'Fmaj7', 'G7'],
        'D': ['Dmaj7', 'Bm7', 'Gmaj7', 'A7'],
        'E': ['Emaj7', 'C#m7', 'Amaj7', 'B7'],
        'F': ['Fmaj7', 'Dm7', 'Bbmaj7', 'C7'],
        'G': ['Gmaj7', 'Em7', 'Cmaj7', 'D7'],
        'A': ['Amaj7', 'F#m7', 'Dmaj7', 'E7'],
        'B': ['Bmaj7', 'G#m7', 'Emaj7', 'F#7']
    }

    if midi_notes:
        root_note_idx = midi_notes[0] % 12
        root_note = note_names[root_note_idx]

        # 找到最接近的调
        if root_note in chord_progressions:
            progression = chord_progressions[root_note]
        else:
            # 找最接近的调
            progression = chord_progressions['C']  # 默认C调

        # 根据旋律长度选择和弦数量
        num_chords = max(1, len(midi_notes) // 3 + 1)
        return progression[:num_chords]

    return ['Cmaj7', 'Dm7', 'G7']

def harmonize_melody_simple(melody, temperature=1.0, k=20):
    """Simplified chord generation (fallback)"""
    print(f"🔄 Using simplified chord generation: {melody}")

    if melody and len(melody) > 0:
        midi_notes = [note_dur[0] for note_dur in melody]
        return generate_chords_from_notes(midi_notes)

    return ["Cmaj7", "Dm7", "G7"]


# API endpoints
@app.route('/api/status', methods=['GET', 'OPTIONS'])
def api_status():
    """Health check endpoint"""
    if request.method == 'OPTIONS':
        return '', 200

    model_status = "loaded" if harmony_model is not None else "not_loaded"
    vocab_info = {}

    if note2in and chord2in:
        vocab_info = {
            "note_vocab_size": len(note2in),
            "chord_vocab_size": len(chord2in),
            "sample_notes": list(note2in.keys())[:10],
            "sample_chords": list(in2chord.values())[:10] if in2chord else []
        }

    return jsonify({
        'status': 'ok',
        'message': 'Backend server running normally',
        'model': 'Custom Transformer Harmony Model',
        'model_status': model_status,
        'device': str(device) if device else 'unknown',
        'vocab_info': vocab_info,
        'version': '2.1.0',
        'cors': 'enabled'
    })


@app.route('/api/harmonize', methods=['POST', 'OPTIONS'])
def api_harmonize():
    """Chord generation endpoint"""

    if request.method == 'OPTIONS':
        return '', 200

    try:
        print("=" * 60)
        print("🎵 Received chord generation request")

        data = request.json
        if not data:
            print("❌ No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400

        melody_input = data.get('melody', [])
        temperature = float(data.get('temperature', 1.0))
        k_value = int(data.get('k', 20))
        mode = data.get('mode', 'notes')

        print(f"📊 API call parameters:")
        print(f"   Mode: {mode}")
        print(f"   Input melody: {melody_input}")
        print(f"   Temperature: {temperature}")
        print(f"   K value: {k_value}")

        if mode == 'notes':
            if harmony_model is not None:
                print("🧠 Using custom Transformer model for chord generation...")
                result_chords = harmonize_melody_transformer(melody_input, temperature, k_value)
                model_info = "Custom Transformer Harmony Model"
            else:
                print("⚠️  Transformer model not loaded, using simplified version...")
                result_chords = harmonize_melody_simple(melody_input, temperature, k_value)
                model_info = "Simplified Harmony Model (fallback)"

            response_data = {
                'input': melody_input,
                'output': result_chords,
                'description': f'{model_info} Temperature:{temperature:.1f},Diversity:{k_value}',
                'model_info': model_info,
                'success': True
            }

            print(f"✅ Generation successful, returning result: {response_data}")
            return jsonify(response_data)
        else:
            print("❌ Unsupported mode")
            return jsonify({
                'error': 'Chord-to-melody functionality not implemented yet'
            }), 501

    except Exception as e:
        print(f"❌ API error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': f'Internal server error: {str(e)}'
        }), 500


@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    print("🚀 Starting Custom Music Server...")
    print("📍 Endpoints:")
    print("  GET  /api/status     - Health check")
    print("  POST /api/harmonize  - Chord generation")
    print("🌐 Server URL: http://localhost:5001")
    print("🔧 CORS: Enabled, allowing all origins")
    print("=" * 60)


    # Attempt to load model
    model_loaded = load_model()

    if model_loaded:
        print("🎉 Server ready with full custom Transformer model!")
    else:
        print("⚠️  Model loading failed, using simplified version as fallback")

    print("=" * 60)

    # Start server
    app.run(
        debug=True,
        port=5001,
        host='0.0.0.0'
    )
