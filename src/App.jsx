import React, { useState, useEffect, useRef } from 'react';
import { PlusCircle, List, Settings, DollarSign, Calendar, MapPin, Tag, Save, CheckCircle, AlertCircle, RefreshCw, Mic, Square, Sparkles, Loader2, BookHeart, Wallet, MoreHorizontal } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

const CATEGORIES = [
{ id: 'breakfast', name: '早餐', icon: '🥞', color: 'bg-orange-100 text-orange-700', hexColor: '#f97316' },
{ id: 'lunch', name: '午餐', icon: '🍱', color: 'bg-green-100 text-green-700', hexColor: '#22c55e' },
{ id: 'dinner', name: '晚餐', icon: '🍽️', color: 'bg-blue-100 text-blue-700', hexColor: '#3b82f6' },
{ id: 'drinks', name: '飲料/點心', icon: '🧋', color: 'bg-yellow-100 text-yellow-700', hexColor: '#eab308' },
{ id: 'traffic', name: '交通', icon: '🚌', color: 'bg-purple-100 text-purple-700', hexColor: '#a855f7' },
{ id: 'shopping', name: '購物', icon: '🛍️', color: 'bg-blue-100 text-blue-700', hexColor: '#60a5fa' },
{ id: 'daily', name: '日常用品', icon: '🧴', color: 'bg-teal-100 text-teal-700', hexColor: '#14b8a6' },
{ id: 'other', name: '其他', icon: '✨', color: 'bg-gray-100 text-gray-700', hexColor: '#64748b' }
];

export default function App() {
const [activeTab, setActiveTab] = useState('add');
const [gasUrl, setGasUrl] = useState('');
const [records, setRecords] = useState([]);
const [isLoading, setIsLoading] = useState(false);
const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

// Gemini AI State
const [geminiApiKey, setGeminiApiKey] = useState('');
const [geminiModel, setGeminiModel] = useState('gemini-3.1-flash-lite-preview');
const [isRecording, setIsRecording] = useState(false);
const [isProcessingAi, setIsProcessingAi] = useState(false);
const mediaRecorderRef = useRef(null);
const audioChunksRef = useRef([]);

// Form State
const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
const [amount, setAmount] = useState('');
const [category, setCategory] = useState(CATEGORIES[1].name);
const [note, setNote] = useState('');

// Filter State (預設從當月 1 號到今天)
const [filterStartDate, setFilterStartDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
});
const [filterEndDate, setFilterEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
});

// Fetch data from Cloud
  const fetchCloudData = async (url) => {
    if (!url) return;
    setIsLoading(true);
    try {
      showStatus('success', '正在從雲端同步資料...');
      const response = await fetch(url);
      const result = await response.json();
      
      if (result && Array.isArray(result.data)) {
        // 將雲端資料更新到本機（以雲端為主）
        setRecords(result.data);
        localStorage.setItem('expense_local_records', JSON.stringify(result.data));
        showStatus('success', '雲端資料同步完成！');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      showStatus('error', '取得雲端資料失敗，請確認 Apps Script 支援跨來源 (CORS) 的 GET 請求');
    } finally {
      setIsLoading(false);
    }
  };

  // Load local data on startup
  useEffect(() => {
    const savedRecords = localStorage.getItem('expense_local_records');
    if (savedRecords) {
      setRecords(JSON.parse(savedRecords));
    }

    const savedUrl = localStorage.getItem('expense_gas_url');
    if (savedUrl) {
      setGasUrl(savedUrl);
      fetchCloudData(savedUrl);
    }

    const savedKey = localStorage.getItem('expense_gemini_key');
    if (savedKey) setGeminiApiKey(savedKey);
    const savedModel = localStorage.getItem('expense_gemini_model');
    if (savedModel) setGeminiModel(savedModel);
  }, []);

const showStatus = (type, text) => {
setStatusMsg({ type, text });
setTimeout(() => setStatusMsg({ type: '', text: '' }), 3000);
};

  const handleSaveSettings = () => {
    if (gasUrl) localStorage.setItem('expense_gas_url', gasUrl);
    else localStorage.removeItem('expense_gas_url');

    if (geminiApiKey) localStorage.setItem('expense_gemini_key', geminiApiKey);
    else localStorage.removeItem('expense_gemini_key');

    localStorage.setItem('expense_gemini_model', geminiModel);

    showStatus('success', '所有設定已儲存！');
    if (gasUrl) fetchCloudData(gasUrl);
  };

  // --- AI Voice Recording Logic ---
  const startRecording = async () => {
    if (!geminiApiKey) {
        showStatus('error', '請先到「設定」頁面輸入 Gemini API Key');
        setActiveTab('settings');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];
        
        recorder.ondataavailable = e => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            processAudioWithGemini(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };
        recorder.start();
        setIsRecording(true);
    } catch (err) {
        showStatus('error', '無法存取麥克風，請確認瀏覽器權限');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    }
  };

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });

  const processAudioWithGemini = async (audioBlob) => {
    setIsProcessingAi(true);
    showStatus('success', '正在分析語音...');
    try {
        const base64Audio = await toBase64(audioBlob);
        const todayDate = new Date().toISOString().split('T')[0];
        const prompt = `這是一段語音記帳紀錄。請仔細聽出裡面的「金額」、「分類」、「備註」以及「日期」。
【重要日期規則】：
1. 今天的實際日期是：${todayDate}。
2. 如果使用者「完全沒有」提到日期或時間，請直接回傳今天的日期 ${todayDate}。
3. 如果提到「昨天」、「前天」或任何特定日期，請推算出對應的 YYYY-MM-DD。

請直接回傳 JSON 格式，不要加 markdown 標記：
{
  "amount": 數字格式的金額,
  "category": "${CATEGORIES.map(c => c.name).join("/")}" (請從其中選出最適合的),
  "note": "語音中提到的買了什麼，或額外地點備註。這不是必填，沒有就填空字串。",
  "date": "YYYY-MM-DD 格式的日期"
}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "audio/webm", data: base64Audio } }
                    ]
                }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        let textResponse = data.candidates[0].content.parts[0].text;
        textResponse = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
        const result = JSON.parse(textResponse);
        
        if (result.date) setDate(result.date);
        if (result.amount) setAmount(String(result.amount));
        if (result.category && CATEGORIES.find(c => c.name === result.category)) setCategory(result.category);
        if (result.note) setNote(result.note);
        
        showStatus('success', '✨ AI 解析完成，已幫您填寫到下方！');
    } catch (err) {
        console.error('AI Error:', err);
        showStatus('error', 'AI 解析失敗，請重試或確認語音清晰度');
    } finally {
        setIsProcessingAi(false);
    }
  };

const handleSubmit = async (e) => {
e.preventDefault();
if (!amount || isNaN(amount)) {
showStatus('error', '請輸入正確的金額');
return;
}

const newRecord = {
id: Date.now().toString(),
date,
category,
amount: parseFloat(amount),
note,
timestamp: new Date().toLocaleString()
};

setIsLoading(true);

try {
// 1. Save locally first (offline first approach)
const updatedRecords = [newRecord, ...records];
setRecords(updatedRecords);
localStorage.setItem('expense_local_records', JSON.stringify(updatedRecords));

// 2. Send to Google Sheets if URL is configured
if (gasUrl) {
// We use mode: 'no-cors' because GAS handles cross-origin POST requests strictly.
// It will successfully write to the sheet even if the browser blocks the read response.
await fetch(gasUrl, {
method: 'POST',
mode: 'no-cors',
headers: {
'Content-Type': 'application/json',
},
body: JSON.stringify(newRecord)
});
showStatus('success', '已成功儲存並同步至試算表！');
} else {
showStatus('success', '已儲存至本機 (尚未設定試算表連動)');
}

// Reset form
setAmount('');
setNote('');
setActiveTab('history');

} catch (error) {
console.error('Sync error:', error);
showStatus('error', '同步至試算表失敗，但已儲存於本機。');
} finally {
setIsLoading(false);
}
};

const clearLocalData = () => {
if (window.confirm('確定要清除所有本機紀錄嗎？（這不會刪除 Google 試算表上的資料）')) {
setRecords([]);
localStorage.removeItem('expense_local_records');
showStatus('success', '本機紀錄已清除');
}
};

const filteredRecords = records.filter(record => {
    if (filterStartDate && record.date < filterStartDate) return false;
    if (filterEndDate && record.date > filterEndDate) return false;
    return true;
}).sort((a, b) => {
    // 優先依照消費日期 (date) 重排，越新的日期在越前面
    if (a.date !== b.date) {
        return new Date(b.date) - new Date(a.date);
    }
    // 如果同一天消費，再依照紀錄的時間 (timestamp) 排序
    return new Date(b.timestamp) - new Date(a.timestamp);
});

const filteredTotalExpense = filteredRecords.reduce((sum, record) => sum + record.amount, 0);

const categoryTotals = filteredRecords.reduce((acc, record) => {
    acc[record.category] = (acc[record.category] || 0) + record.amount;
    return acc;
}, {});

// Generate Data for Pie Chart
const pieData = Object.keys(categoryTotals).map(key => {
    const catInfo = CATEGORIES.find(c => c.name === key) || CATEGORIES[7];
    return {
        name: key,
        value: categoryTotals[key],
        color: catInfo.hexColor || '#8884d8'
    };
}).sort((a, b) => b.value - a.value);

return (
<div className="min-h-screen bg-slate-50 flex justify-center font-sans text-slate-800">
    <div className="w-full max-w-md bg-white shadow-xl flex flex-col h-screen relative">

        {/* Header */}
        <header className="bg-gradient-to-r from-blue-400 to-blue-500 text-white pt-6 pb-5 px-4 shadow-[0_4px_20px_rgba(236,72,153,0.3)] z-10 rounded-b-[2.5rem]">
            <h1 className="text-xl font-bold text-center tracking-widest flex items-center justify-center gap-2">
                <Sparkles size={18} /> 我的雲端記帳本
            </h1>
        </header>

        {/* Status Toast */}
        {statusMsg.text && (
        <div className={`absolute top-20 left-1/2 transform -translate-x-1/2 px-5 py-2.5 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.1)] z-50 flex
            items-center gap-2 text-sm font-bold animate-fade-in-down ${ statusMsg.type==='success'
            ? 'bg-green-500 text-white' : 'bg-red-500 text-white' }`}>
            {statusMsg.type === 'success' ?
            <CheckCircle size={18} /> :
            <AlertCircle size={18} />}
            {statusMsg.text}
        </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 pb-32">

            {/* TAB 1: ADD EXPENSE */}
            {activeTab === 'add' && (
            <>
                <div className="space-y-6 animate-fade-in relative pt-2">
                    <form onSubmit={handleSubmit} className="space-y-6 relative">

                    {/* Amount */}
                    <div className="bg-blue-50 p-5 rounded-3xl flex items-center shadow-inner ring-1 ring-blue-100">
                        <DollarSign className="text-blue-400 mr-2" size={36} />
                        <input type="number" value={amount} onChange={(e)=> setAmount(e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent text-5xl font-bold text-blue-900 outline-none
                        placeholder-blue-200"
                        required
                        />
                    </div>

                    {/* Categories */}
                    <div>
                        <div className="grid grid-cols-4 gap-3">
                            {CATEGORIES.map(cat => (
                            <button type="button" key={cat.id} onClick={()=> setCategory(cat.name)}
                                className={`flex flex-col items-center justify-center p-2 pt-3 aspect-square rounded-3xl border 
                                transition-all ${
                                category === cat.name
                                ? 'border-blue-300 bg-blue-50 scale-105 shadow-[0_8px_20px_rgba(244,114,182,0.2)]'
                                : 'border-slate-100 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.03)] hover:bg-blue-50/50'
                                }`}
                                >
                                <span className="text-4xl mb-1.5 drop-shadow-sm">{cat.icon}</span>
                                <span className="text-[11px] font-bold text-slate-600 tracking-wide">{cat.name}</span>
                            </button>
                            ))}
                        </div>
                    </div>

                    {/* Date & Location/Note */}
                    <div className="space-y-3">
                        <div className="flex items-center bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm focus-within:border-blue-300 transition-colors">
                            <Calendar className="text-blue-400 mr-3" size={20} />
                            <input type="date" value={date} onChange={(e)=> setDate(e.target.value)}
                            className="w-full bg-transparent outline-none text-slate-700 font-medium"
                            required
                            />
                        </div>
                        <div className="flex items-center bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm focus-within:border-blue-300 transition-colors">
                            <MapPin className="text-blue-400 mr-3" size={20} />
                            <input type="text" value={note} onChange={(e)=> setNote(e.target.value)}
                            placeholder="在哪裡花？買了什麼？(選填)"
                            className="w-full bg-transparent outline-none text-slate-700 font-medium placeholder-slate-300"
                            />
                        </div>
                    </div>

                    <button type="submit" disabled={isLoading}
                        className="w-full bg-gradient-to-r from-blue-500 to-blue-500 text-white font-bold py-4 rounded-2xl shadow-[0_10px_20px_rgba(236,72,153,0.3)] hover:opacity-90 active:scale-95 transition-all flex justify-center items-center gap-2 text-lg">
                        {isLoading ?
                        <RefreshCw className="animate-spin" size={22} /> :
                        <Save size={22} />}
                        {isLoading ? '儲存中...' : '記上一筆'}
                    </button>
                </form>
            </div>

            {/* 懸浮 AI 語音按鈕 (FAB) */}
            <div className="absolute bottom-28 right-6 z-50">
                {isRecording ? (
                    <button type="button" onClick={stopRecording} className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500 text-white shadow-[0_8px_16px_rgba(239,68,68,0.4)] animate-pulse transition-all">
                        <Square size={24} fill="currentColor" />
                    </button>
                ) : isProcessingAi ? (
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-500 text-white shadow-lg">
                        <Loader2 size={24} className="animate-spin" />
                    </div>
                ) : (
                    <button type="button" onClick={startRecording} className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-500 text-white hover:bg-blue-600 hover:scale-110 transition-all shadow-[0_8px_20px_rgba(236,72,153,0.4)] group">
                        <Mic size={24} className="group-hover:scale-110 transition-transform" />
                    </button>
                )}
            </div>
            </>
            )}

            {/* TAB 2: HISTORY */}
            {activeTab === 'history' && (
            <div className="animate-fade-in space-y-4">
                
                {/* 篩選器 */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>📅 日期區間篩選</span>
                    </h3>
                    <div className="flex gap-2">
                        <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="flex-1 bg-slate-50 font-medium text-sm p-3 rounded-xl border border-slate-100 outline-none focus:border-blue-400" />
                        <span className="text-slate-400 self-center text-sm">至</span>
                        <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="flex-1 bg-slate-50 font-medium text-sm p-3 rounded-xl border border-slate-100 outline-none focus:border-blue-400" />
                    </div>
                </div>

                {/* 總計 */}
                <div className="bg-gradient-to-r from-blue-400 to-blue-500 rounded-3xl p-6 text-white shadow-[0_10px_20px_rgba(236,72,153,0.2)] relative overflow-hidden">
                    <div className="relative z-10">
                        <p className="text-blue-100 text-sm font-bold mb-1 tracking-wider">區間總支出</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl">$</span>
                            <span className="text-5xl font-extrabold tracking-tight">{filteredTotalExpense.toLocaleString()}</span>
                        </div>
                    </div>
                    {/* 裝飾背景 */}
                    <DollarSign size={100} className="absolute -right-6 -bottom-6 text-white opacity-10" />
                </div>

                {/* 圓餅圖 */}
                {pieData.length > 0 && (
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-700 text-sm mb-2">分類支出佔比</h3>
                    <div className="h-56 w-full -ml-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                  data={pieData}
                                  cx="50%"
                                  cy="45%"
                                  innerRadius={45}
                                  outerRadius={75}
                                  paddingAngle={3}
                                  dataKey="value"
                                  stroke="none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    formatter={(value) => `$${value}`} 
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 8px 16px -4px rgb(0 0 0 / 0.1)' }} 
                                    itemStyle={{ fontWeight: 'bold' }} 
                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                )}

                {/* 列表標題與同步 */}
                <div className="flex justify-between items-center mt-4 mb-2 pb-1 border-b border-slate-100">
                    <h2 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                        篩選結果明細
                        <span className="bg-blue-100 text-blue-600 text-[10px] px-2.5 py-1 rounded-full">{filteredRecords.length} 筆</span>
                    </h2>
                    <div className="flex gap-2">
                        {gasUrl && (
                        <button onClick={() => fetchCloudData(gasUrl)} disabled={isLoading} className="text-[10px] font-bold text-blue-500 hover:bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1 transition-colors shadow-sm">
                            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} /> 同步雲端
                        </button>
                        )}
                        <button onClick={clearLocalData} className="text-[10px] font-bold text-slate-500 hover:bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200 transition-colors shadow-sm">
                            清除本機
                        </button>
                    </div>
                </div>

                {/* 明細清單 */}
                {filteredRecords.length === 0 ? (
                <div className="text-center text-slate-400 py-10 flex flex-col items-center bg-white rounded-3xl border border-dashed border-slate-200">
                    <List size={48} className="mb-3 opacity-20" />
                    <p className="font-medium text-sm">此區間無任何記帳紀錄</p>
                </div>
                ) : (
                <div className="space-y-3 pb-8">
                    {filteredRecords.map(record => {
                    const catInfo = CATEGORIES.find(c => c.name === record.category) || CATEGORIES[7];
                    return (
                    <div key={record.id}
                        className="bg-white border border-slate-100 p-4 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.02)] flex items-center justify-between hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm
                                ${catInfo.color}`}>
                                {catInfo.icon}
                            </div>
                            <div>
                                <p className="font-bold text-slate-800 text-base mb-0.5">{record.category}</p>
                                <p className="text-[11px] font-bold text-slate-400 max-w-[150px] truncate leading-tight">
                                    {record.date} <br/> {record.note && <span className="text-slate-500">{record.note}</span>}
                                </p>
                            </div>
                        </div>
                        <div className="font-black text-xl text-slate-800 tracking-tight">
                            ${record.amount.toLocaleString()}
                        </div>
                    </div>
                    )
                    })}
                </div>
                )}
            </div>
            )}

            {/* TAB 3: SETTINGS */}
            {activeTab === 'settings' && (
            <div className="animate-fade-in space-y-6">
                
                {/* ---------- API & Apps Script 儲存區 ---------- */}
                <div className="bg-white p-6 rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.02)] border border-slate-100 space-y-6">
                    
                    {/* Gemini Settings */}
                    <div>
                        <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
                            <Sparkles className="text-blue-500 w-5 h-5" />
                            AI 語音記帳設定
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 uppercase tracking-wider">
                                    Google Gemini API Key
                                </label>
                                <input 
                                    type="password" 
                                    value={geminiApiKey} 
                                    onChange={(e)=> setGeminiApiKey(e.target.value)}
                                    placeholder="AIzaSy..."
                                    className="w-full bg-slate-50 border-2 border-slate-100 p-3.5 rounded-2xl outline-none focus:border-blue-400 text-sm font-mono font-medium"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 uppercase tracking-wider">
                                    選擇 AI 模型
                                </label>
                                <select 
                                    value={geminiModel} 
                                    onChange={(e)=> setGeminiModel(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-slate-100 p-3.5 rounded-2xl outline-none focus:border-blue-400 text-sm font-medium"
                                >
                                    <option value="gemini-3.1-flash-lite-preview">gemini-3.1-flash-lite-preview (預設，小巧快速)</option>
                                    <option value="gemini-3-flash-preview">gemini-3-flash-preview (聰明，一天限制 20 次)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 my-4"></div>

                    {/* GAS Settings */}
                    <div>
                        <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/3/30/Google_Sheets_logo_%282014-2020%29.svg"
                                alt="Sheets" className="w-5 h-5" />
                            Google 試算表連動設定
                        </h2>
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-500 block mb-1.5 uppercase tracking-wider">
                                Apps Script Web App 網址
                            </label>
                            <textarea value={gasUrl} onChange={(e)=> setGasUrl(e.target.value)}
                                placeholder="https://script.google.com/macros/s/.../exec"
                                className="w-full bg-slate-50 border-2 border-slate-100 p-3.5 rounded-2xl outline-none focus:border-blue-400 text-sm h-24 font-mono break-all font-medium leading-relaxed"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSaveSettings}
                        className="w-full bg-slate-800 text-white py-4 rounded-2xl text-base font-bold hover:bg-slate-700 shadow-md transition-colors"
                    >
                        儲存全部設定
                    </button>
                </div>

              <div className="bg-blue-50 p-6 rounded-3xl text-sm text-blue-900 border border-blue-100">
                <h3 className="font-bold text-base mb-3 flex items-center gap-2">💡 如何取得網址？</h3>
                <ol className="list-decimal pl-5 space-y-2 opacity-90 font-medium">
                  <li>建立一個新的 Google 試算表</li>
                  <li>點擊上方 <strong>擴充功能</strong> {'>'} <strong>Apps Script</strong></li>
                  <li>貼上專屬的程式碼（需要實作 doPost 和 doGet）</li>
                  <li>點擊右上角 <strong>部署</strong> {'>'} <strong>新增部署作業</strong></li>
                  <li>類型選擇 <strong>網頁應用程式</strong></li>
                  <li>「誰可以存取」選擇 <strong>所有人</strong>，點擊部署</li>
                  <li>將產生的網址貼回上方的輸入框中儲存</li>
                </ol>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Navigation */}
        <nav className="absolute bottom-0 w-full bg-white/90 backdrop-blur-md border-t border-slate-100 flex justify-around p-2 pb-6 px-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] rounded-t-[2.5rem] z-20">
          <button 
            onClick={() => setActiveTab('add')}
            className={`flex flex-col items-center justify-center w-20 h-14 transition-all ${activeTab === 'add' ? 'text-blue-500 scale-110 -translate-y-1 drop-shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <BookHeart size={26} className="mb-1 stroke-[2.5]" />
            <span className="text-[10px] font-bold">記帳本</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center w-20 h-14 transition-all ${activeTab === 'history' ? 'text-blue-500 scale-110 -translate-y-1 drop-shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Wallet size={26} className="mb-1 stroke-[2.5]" />
            <span className="text-[10px] font-bold">明細</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center w-20 h-14 transition-all ${activeTab === 'settings' ? 'text-blue-500 scale-110 -translate-y-1 drop-shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <MoreHorizontal size={26} className="mb-1 stroke-[2.5]" />
            <span className="text-[10px] font-bold">更多</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
