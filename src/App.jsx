import React, { useState, useEffect, useRef } from 'react';
import { Camera, Printer, Trash2, RefreshCw, AlertCircle, CheckCircle2, FileImage, CloudUpload } from 'lucide-react';


// Create 45 empty rows
const generateDefaultItems = () => {
  return Array.from({ length: 45 }, (_, i) => ({
    slNo: i + 1,
    description: "",
    partNumber: "",
    quantity: "",
    crp: ""
  }));
};

const getTodayFormatted = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const INITIAL_STATE = {
  otfNumber: "",
  outlet: "",
  date: getTodayFormatted(),
  customerName: "",
  customerCode: "",
  regNo: "",
  engineNo: "",
  chassisNo: "",
  receivedForFitment: "",
  vehicleDelivery: "",
  items: generateDefaultItems()
};

export default function App() {
  const [formData, setFormData] = useState(INITIAL_STATE);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [statusType, setStatusType] = useState('info'); 
  
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Load saved form data on initial render
  useEffect(() => {
    const savedForm = localStorage.getItem('vayalat_form_data');
    if (savedForm) {
      try { setFormData(JSON.parse(savedForm)); } catch (e) { console.error("Failed to parse form data"); }
    }
  }, []);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('vayalat_form_data', JSON.stringify(formData));
  }, [formData]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const clearForm = () => {
    if (window.confirm("Are you sure you want to clear the entire form?")) {
      setFormData(INITIAL_STATE);
      localStorage.removeItem('vayalat_form_data');
    }
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const fetchWithRetry = async (url, options, maxRetries = 5) => {
    let retries = 0;
    const delays = [1000, 2000, 4000, 8000, 16000];
    while (retries < maxRetries) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (error) {
        if (retries === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delays[retries]));
        retries++;
      }
    }
  };

  const extractFormWithAI = async (event) => {
    const file = event.target.files[0];
    if (!file) return;


    setIsExtracting(true);
    setStatusType('info');
    setExtractionStatus('Analyzing image with AI...');

    try {
      const base64Image = await fileToBase64(file);
      const mimeType = file.type || "image/jpeg";

      const prompt = `
        Analyze this order taking form carefully.
        1. Extract the RED stamped number at the top right as the 'otfNumber'.
        2. Extract standard fields like outlet, date, customerName, etc., if visible. Ensure the date is formatted as DD-MM-YYYY.
        3. Read the table. For every row that has handwritten text, extract the slNo (row number), description, partNumber, quantity, and crp (price).
        Pay close attention to handwriting.
      `;

      const schema = {
        type: "OBJECT",
        properties: {
          otfNumber: { type: "STRING" },
          outlet: { type: "STRING" },
          date: { type: "STRING" },
          customerName: { type: "STRING" },
          customerCode: { type: "STRING" },
          regNo: { type: "STRING" },
          engineNo: { type: "STRING" },
          chassisNo: { type: "STRING" },
          receivedForFitment: { type: "STRING" },
          vehicleDelivery: { type: "STRING" },
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                slNo: { type: "NUMBER" },
                description: { type: "STRING" },
                partNumber: { type: "STRING" },
                quantity: { type: "STRING" },
                crp: { type: "STRING" }
              }
            }
          }
        }
      };

      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: base64Image } }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema }
      };

      const url = `/api/extract`;

      setExtractionStatus('Extracting fields and prices...');
      const result = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) });

      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error("No data returned from AI");

      const extractedData = JSON.parse(textResponse);
      
      setFormData(prev => {
        const newItems = [...prev.items];
        if (extractedData.items && Array.isArray(extractedData.items)) {
          extractedData.items.forEach(extractedItem => {
            const index = extractedItem.slNo - 1;
            if (index >= 0 && index < 45) {
              newItems[index] = {
                ...newItems[index],
                description: extractedItem.description || "",
                partNumber: extractedItem.partNumber || "",
                quantity: extractedItem.quantity || "",
                crp: extractedItem.crp || ""
              };
            }
          });
        }

        return {
          ...prev,
          otfNumber: extractedData.otfNumber || prev.otfNumber,
          outlet: extractedData.outlet || prev.outlet,
          date: extractedData.date || prev.date,
          customerName: extractedData.customerName || prev.customerName,
          customerCode: extractedData.customerCode || prev.customerCode,
          regNo: extractedData.regNo || prev.regNo,
          engineNo: extractedData.engineNo || prev.engineNo,
          chassisNo: extractedData.chassisNo || prev.chassisNo,
          receivedForFitment: extractedData.receivedForFitment || prev.receivedForFitment,
          vehicleDelivery: extractedData.vehicleDelivery || prev.vehicleDelivery,
          items: newItems
        };
      });

      setStatusType('success');
      setExtractionStatus('Extraction complete!');

    } catch (err) {
      console.error(err);
      setStatusType('error');
      setExtractionStatus('Failed to extract form data. Please try again.');
    } finally {
      setTimeout(() => setExtractionStatus(''), 4000);
      setIsExtracting(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const submitToGoogleSheets = async () => {
    if (!GLOBAL_SCRIPT_URL || GLOBAL_SCRIPT_URL.includes("YOUR_SCRIPT_ID")) {
      alert("Google Sheets Web App URL is missing in the code!");
      return;
    }
    if (!formData.otfNumber && !formData.customerName) {
      alert("Please fill in at least the OTF Number or Customer Name before saving.");
      return;
    }

    setIsSubmitting(true);
    setStatusType('info');
    setExtractionStatus('Saving to Google Sheets...');

    try {
      const filledItems = formData.items.filter(item => 
        item.partNumber.trim() !== '' || item.quantity.trim() !== '' || 
        item.crp.trim() !== '' || item.description.trim() !== '' 
      );

      const itemsSummary = filledItems.map(item => 
        `${item.description} (Qty: ${item.quantity || '-'}, Part: ${item.partNumber || '-'}, CRP: ${item.crp || '-'})`
      ).join(' | ');

      const payload = {
        otfNumber: formData.otfNumber,
        outlet: formData.outlet,
        date: formData.date,
        customerName: formData.customerName,
        customerCode: formData.customerCode,
        regNo: formData.regNo,
        engineNo: formData.engineNo,
        chassisNo: formData.chassisNo,
        totalPrice: calculateTotal(),
        receivedForFitment: formData.receivedForFitment,
        vehicleDelivery: formData.vehicleDelivery,
        itemsSummary: itemsSummary || "No items recorded"
      };

      const response = await fetch(GLOBAL_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.status === 'success') {
        setStatusType('success');
        setExtractionStatus('Successfully saved to Google Sheets!');
      } else {
        throw new Error("Script returned an error.");
      }
    } catch (error) {
      console.error(error);
      setStatusType('error');
      setExtractionStatus('Failed to save. Check internet connection.');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setExtractionStatus(''), 5000);
    }
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => {
      if (!item.crp) return sum;
      const cleanPrice = parseFloat(item.crp.replace(/[^0-9.]/g, ''));
      return sum + (isNaN(cleanPrice) ? 0 : cleanPrice);
    }, 0);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-2 md:p-6 pb-24 print:bg-white print:p-0">
      
      {/* Top Action Bar */}
      <div className="max-w-4xl mx-auto mb-4 bg-white rounded-lg shadow-sm p-4 flex flex-col sm:flex-row gap-4 justify-between items-center print:hidden">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-gray-800">Form Digitizer AI</h2>
          <p className="text-sm text-gray-500">Auto-saves locally</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {/* Hidden File Inputs */}
          <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={extractFormWithAI} className="hidden" />
          <input type="file" accept="image/*" ref={galleryInputRef} onChange={extractFormWithAI} className="hidden" />
          
          <button onClick={() => cameraInputRef.current?.click()} disabled={isExtracting || isSubmitting} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-md font-medium transition-colors text-sm">
            {isExtracting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span className="hidden sm:inline">AI Scan</span>
          </button>

          <button onClick={() => galleryInputRef.current?.click()} disabled={isExtracting || isSubmitting} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-2 rounded-md font-medium transition-colors text-sm">
            {isExtracting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileImage className="w-4 h-4" />}
            <span className="hidden sm:inline">Upload Image</span>
          </button>

          <button onClick={submitToGoogleSheets} disabled={isSubmitting || isExtracting} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-md font-bold transition-colors shadow-sm">
            {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />}
            <span>Save to Sheet</span>
          </button>

          <button onClick={() => window.print()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 rounded-md font-medium transition-colors text-sm">
            <Printer className="w-4 h-4" />
          </button>

          <button onClick={clearForm} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded-md font-medium transition-colors text-sm" title="Clear Form">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status Message Overlay */}
      {extractionStatus && (
        <div className={`max-w-4xl mx-auto mb-4 p-4 rounded-md flex items-center gap-3 print:hidden shadow-sm ${
          statusType === 'info' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
          statusType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {statusType === 'info' && <RefreshCw className="w-5 h-5 animate-spin" />}
          {statusType === 'success' && <CheckCircle2 className="w-5 h-5" />}
          {statusType === 'error' && <AlertCircle className="w-5 h-5" />}
          <span className="font-medium">{extractionStatus}</span>
        </div>
      )}

      {/* Main Form Paper */}
      <div className="max-w-4xl mx-auto bg-white border border-gray-300 shadow-lg print:shadow-none print:border-none">
        
        {/* Header Section */}
        <div className="p-6 border-b-2 border-black">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
            <div>
              <h1 className="text-4xl font-serif font-bold tracking-tighter leading-none">M</h1>
              <p className="text-[10px] font-bold tracking-widest uppercase mt-1">Vayalat</p>
            </div>
            
            <div className="border-2 border-black px-6 py-1 mx-auto text-center font-bold text-lg md:text-xl tracking-wider">
              ORDER TAKING FORM
            </div>
            
            <div className="flex flex-col items-end w-full md:w-auto">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-gray-700 whitespace-nowrap">Form No:</span>
                <input 
                  type="text" 
                  value={formData.otfNumber}
                  onChange={(e) => handleInputChange('otfNumber', e.target.value)}
                  placeholder="e.g. 8279"
                  className="text-red-600 font-bold text-xl md:text-2xl w-24 md:w-32 border-b-2 border-red-200 bg-red-50/50 p-1 outline-none focus:border-red-500 print:bg-transparent print:border-none print:p-0 text-right"
                />
              </div>
              <div className="text-sm font-bold tracking-wider text-gray-500 flex items-center gap-1">
                <span>Mahindra</span>
              </div>
            </div>
          </div>

          {/* Core Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm font-medium">
            <div className="flex items-center gap-2 border-b border-gray-300 print:border-black pb-1">
              <span className="whitespace-nowrap w-24">Outlet:</span>
              <input type="text" value={formData.outlet} onChange={(e) => handleInputChange('outlet', e.target.value)} className="w-full outline-none bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
            <div className="flex items-center gap-2 border-b border-gray-300 print:border-black pb-1">
              <span className="whitespace-nowrap w-24">Date:</span>
              <input type="text" value={formData.date} onChange={(e) => handleInputChange('date', e.target.value)} className="w-full outline-none bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
            <div className="flex items-center gap-2 border-b border-gray-300 print:border-black pb-1">
              <span className="whitespace-nowrap w-32">Customer's Name:</span>
              <input type="text" value={formData.customerName} onChange={(e) => handleInputChange('customerName', e.target.value)} className="w-full outline-none bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
            <div className="flex items-center gap-2 border-b border-gray-300 print:border-black pb-1">
              <span className="whitespace-nowrap w-32">Customer Code:</span>
              <input type="text" value={formData.customerCode} onChange={(e) => handleInputChange('customerCode', e.target.value)} className="w-full outline-none bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
            <div className="flex items-center gap-2 border-b border-gray-300 print:border-black pb-1">
              <span className="whitespace-nowrap w-24">Engine No:</span>
              <input type="text" value={formData.engineNo} onChange={(e) => handleInputChange('engineNo', e.target.value)} className="w-full outline-none bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
            <div className="flex items-center gap-2 border-b border-gray-300 print:border-black pb-1">
              <span className="whitespace-nowrap w-24">Reg. No:</span>
              <input type="text" value={formData.regNo} onChange={(e) => handleInputChange('regNo', e.target.value)} className="w-full outline-none bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
            <div className="flex items-center gap-2 border-b border-gray-300 print:border-black pb-1 md:col-span-2">
              <span className="whitespace-nowrap w-24">Chaiss No:</span>
              <input type="text" value={formData.chassisNo} onChange={(e) => handleInputChange('chassisNo', e.target.value)} className="w-full outline-none bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto print:overflow-visible p-6 pt-0">
          <table className="w-full text-sm border-collapse mt-4">
            <thead>
              <tr className="bg-gray-100 print:bg-gray-200">
                <th className="border border-black p-1 md:p-2 w-10 md:w-16 font-semibold">Sl.No</th>
                <th className="border border-black p-1 md:p-2 font-semibold text-left">Item Description</th>
                <th className="border border-black p-1 md:p-2 w-32 md:w-64 font-semibold text-left">Part Number(s)</th>
                <th className="border border-black p-1 md:p-2 w-16 md:w-24 font-semibold">Quantity</th>
                <th className="border border-black p-1 md:p-2 w-20 md:w-32 font-semibold">CRP</th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, index) => (
                <tr key={index} className="hover:bg-yellow-50/50 print:hover:bg-transparent">
                  <td className="border border-black p-1 text-center font-medium text-gray-600">{item.slNo}</td>
                  <td className="border border-black p-0">
                    <input type="text" value={item.description} onChange={(e) => handleItemChange(index, 'description', e.target.value)} className="w-full h-full px-2 py-1 outline-none focus:bg-blue-50 font-medium text-blue-900 print:text-black print:focus:bg-transparent bg-transparent" />
                  </td>
                  <td className="border border-black p-0">
                    <input type="text" value={item.partNumber} onChange={(e) => handleItemChange(index, 'partNumber', e.target.value)} className="w-full h-full px-2 py-1 outline-none focus:bg-blue-50 font-medium text-blue-900 print:text-black print:focus:bg-transparent bg-transparent" />
                  </td>
                  <td className="border border-black p-0">
                    <input type="text" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} className="w-full h-full px-2 py-1 text-center outline-none focus:bg-blue-50 font-medium text-blue-900 print:text-black print:focus:bg-transparent bg-transparent" />
                  </td>
                  <td className="border border-black p-0">
                    <input type="text" value={item.crp} onChange={(e) => handleItemChange(index, 'crp', e.target.value)} className="w-full h-full px-2 py-1 text-right outline-none focus:bg-blue-50 font-medium text-blue-900 print:text-black print:focus:bg-transparent bg-transparent" />
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Total Footer */}
            <tfoot>
              <tr>
                <td colSpan="4" className="border border-black p-2 text-right font-bold text-gray-800 bg-gray-50">
                  TOTAL PRICE:
                </td>
                <td className="border border-black p-2 text-right font-bold text-lg text-green-700 print:text-black bg-green-50 print:bg-transparent">
                  ₹{calculateTotal().toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer Section */}
        <div className="p-6 pt-0 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-black border-b-0 p-2 font-medium">
            <div className="flex gap-2 items-center">
              <span>Received for Fitment [Date & Time]:</span>
              <input type="text" value={formData.receivedForFitment} onChange={(e) => handleInputChange('receivedForFitment', e.target.value)} className="flex-1 border-b border-gray-300 outline-none print:border-black bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
            <div className="flex gap-2 items-center">
              <span>Vehicle Delivery Date & Time:</span>
              <input type="text" value={formData.vehicleDelivery} onChange={(e) => handleInputChange('vehicleDelivery', e.target.value)} className="flex-1 border-b border-gray-300 outline-none print:border-black bg-transparent font-bold text-blue-900 print:text-black" />
            </div>
          </div>
          
          <div className="border border-black p-2 bg-gray-50 print:bg-transparent">
            <p className="font-semibold mb-1">Terms & Condition</p>
            <ol className="list-decimal pl-4 text-xs text-gray-700 print:text-black space-y-1">
              <li>The price ruling at the time of delivery only will be applicable irrespective of the fact as when payment was made.</li>
              <li>This is not a firm order and no claim for priority can be made on the basis of this quotation / Performa.</li>
              <li>The price quoted is for immediate delivery only. In case of any increase in price by the manufacturer before delivery the order shall be construed as if the increased prices were originally inserted there in.</li>
            </ol>
            <p className="text-[10px] mt-1">E & O E</p>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center mt-16 px-4 pb-4 gap-8 md:gap-0">
            <div className="text-center w-full md:w-auto">
              <div className="border-t border-black pt-2 w-48 mx-auto">Name & Sign of Customer</div>
            </div>
            <div className="text-center w-full md:w-auto">
              <div className="border-t border-black pt-2 w-56 mx-auto">Name & Sign of Sales/Accessory Executive</div>
            </div>
            <div className="text-center w-full md:w-auto">
              <p className="font-semibold mb-6">For Vayalat Mahindra</p>
              <div className="border-t border-black pt-2 w-48 mx-auto">Name & Sign of Sales Manager</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
