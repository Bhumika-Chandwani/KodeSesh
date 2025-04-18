import { useState, useEffect, useRef } from 'react';
import { io } from "socket.io-client";
import FileExplorer from '../components/FileExplorer';
import EditorHeader from '../components/EditorHeader';
import CodeEditor from '../components/CodeEditor';
import CallPanel from '../components/CallPanel';
import TerminalPanel from '../components/TerminalPanel';
import { Link, useNavigate, useParams } from 'react-router-dom';

const CodeEditorDashboard = () => {
  // State management
  const [code, setCode] = useState("// Start writing your code here!");
  const [selectedFile, setSelectedFile] = useState("main.js");
  const [currentLanguage, setCurrentLanguage] = useState("javascript"); // Default language
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCallPanelOpen, setIsCallPanelOpen] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeParticipants, setActiveParticipants] = useState([
    { id: 1, name: "You", isHost: true, isMuted: false, isVideoOff: false },
  ]);
  const [socket, setSocket] = useState(null);
  
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const activeSessionId = sessionId || "demo-session";
  
  // Set default code templates based on language
  const codeTemplates = {
    javascript: `console.log("Hello World");
`,
    python: `print("Hello World")

`
  };

  // Socket connection
  useEffect(() => {
    // Create socket connection
    const newSocket = io("http://localhost:5000", {
      transports: ["websocket", "polling"],
      upgrade: true,
      forceNew: true,
    });
    
    setSocket(newSocket);
    
    // Set up event listeners once socket is created
    newSocket.on("connect", () => {
      console.log("Connected to server with ID:", newSocket.id);
      
      // Join the session
      newSocket.emit("joinSession", activeSessionId);
      
      // Join as a participant
      const userId = localStorage.getItem("userId") || Date.now().toString();
      localStorage.setItem("userId", userId); // Ensure userId is saved
      const userName = localStorage.getItem("userName") || "Anonymous";
      
      newSocket.emit("userJoined", {
        userId,
        name: userName,
        isHost: !sessionId, // If no sessionId in URL, treat as host
        sessionId: activeSessionId
      });
      
      // Request current participants
      newSocket.emit("getParticipants", activeSessionId);

      // Request current language state from server/host
      newSocket.emit("getLanguageState", activeSessionId);
    });
    
    // Listen for code updates
    newSocket.on("codeUpdate", (updatedCode) => {
      console.log("Received code update:", updatedCode);
      setCode(updatedCode);
    });
    
    // Listen for language updates (enhanced)
    newSocket.on("languageUpdate", (data) => {
      const updatedLanguage = typeof data === 'object' ? data.language : data;
      console.log("Received language update:", updatedLanguage);
      
      if (updatedLanguage && supportedLanguages.includes(updatedLanguage)) {
        setCurrentLanguage(updatedLanguage);
        
        // Update the code to match the language template if it's empty or just has the default
        const isDefaultJsCode = code === codeTemplates.javascript || code === "// Start writing your code here!";
        const isDefaultPyCode = code === codeTemplates.python;
        
        if (isDefaultJsCode || isDefaultPyCode) {
          setCode(codeTemplates[updatedLanguage]);
        }
        
        // Update file extension
        updateFileExtension(updatedLanguage);
      }
    });
    
    // Listen for code execution results from other users
    newSocket.on("executionResult", (result) => {
      console.log("Received execution result:", result);
      if (result.terminalEntries) {
        // Handle full terminal entries
        setTerminalOutput(prev => [...prev, ...result.terminalEntries]);
      } else {
        // Handle basic output format
        setTerminalOutput(prev => [...prev, 
          { type: 'output', content: result.output }
        ]);
      }
      
      // Ensure terminal is open to show the results
      if (!isTerminalOpen) {
        setIsTerminalOpen(true);
      }
    });
    
    // Listen for participants updates
    newSocket.on("participantsList", (participants) => {
      console.log("Received participants list:", participants);
      
      // Add our own participant if not already included
      const userId = localStorage.getItem("userId");
      const ownParticipant = participants.find(p => p.id.toString() === userId);
      
      if (!ownParticipant) {
        const myParticipant = {
          id: userId,
          name: localStorage.getItem("userName") || "You",
          isHost: !sessionId,
          isMuted: !isAudioOn,
          isVideoOff: !isVideoOn
        };
        setActiveParticipants([myParticipant, ...participants]);
      } else {
        setActiveParticipants(participants);
      }
    });
    
    // Listen for participant join
    newSocket.on("participantJoined", (participant) => {
      console.log("Participant joined:", participant);
      setActiveParticipants(prev => {
        // Check if participant already exists
        const exists = prev.some(p => p.id.toString() === participant.id.toString());
        if (exists) {
          return prev.map(p => p.id.toString() === participant.id.toString() ? participant : p);
        }
        // Add new participant
        return [...prev, participant];
      });
      
      // If this is a new participant and we're the host, initiate WebRTC
      if (participant.id.toString() !== localStorage.getItem("userId")) {
        newSocket.emit("rtcNewParticipant", {
          sessionId: activeSessionId,
          participantId: participant.id
        });
      }
    });
    
    // Listen for participant leave
    newSocket.on("participantLeft", (participantId) => {
      console.log("Participant left:", participantId);
      setActiveParticipants(prev => prev.filter(p => p.id !== participantId));
    });
    
    // Listen for audio toggle events
    newSocket.on("audioToggled", ({ userId, isMuted }) => {
      console.log(`Participant ${userId} audio toggled, muted: ${isMuted}`);
      setActiveParticipants(prev => 
        prev.map(p => p.id.toString() === userId.toString() ? {...p, isMuted} : p)
      );
    });
    
    // Listen for video toggle events
    newSocket.on("videoToggled", ({ userId, isVideoOff }) => {
      console.log(`Participant ${userId} video toggled, off: ${isVideoOff}`);
      setActiveParticipants(prev => 
        prev.map(p => p.id.toString() === userId.toString() ? {...p, isVideoOff} : p)
      );
    });
    
    // Listen for screen sharing events
    newSocket.on("screenSharingStarted", ({ userId }) => {
      console.log(`Participant ${userId} started screen sharing`);
      setActiveParticipants(prev => 
        prev.map(p => p.id.toString() === userId.toString() ? {...p, isScreenSharing: true} : p)
      );
    });
    
    newSocket.on("screenSharingEnded", ({ userId }) => {
      console.log(`Participant ${userId} ended screen sharing`);
      setActiveParticipants(prev => 
        prev.map(p => p.id.toString() === userId.toString() ? {...p, isScreenSharing: false} : p)
      );
    });
    
    // Clean up on unmount
    return () => {
      console.log("Disconnecting socket");
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [activeSessionId]);

  // List of supported languages
  const supportedLanguages = ["javascript", "python"];

  // Initialize code based on selected language
  useEffect(() => {
    // Set initial code based on language
    setCode(codeTemplates[currentLanguage]);
    
    // Update file extension
    updateFileExtension(currentLanguage);
    
    // Initialize user info
    if (!localStorage.getItem("userId")) {
      localStorage.setItem("userId", Date.now().toString());
    }
    
    if (!localStorage.getItem("userName")) {
      localStorage.setItem("userName", "Anonymous");
    }
  }, []);

  // Update file extension based on language
  const updateFileExtension = (language) => {
    const extensions = {
      javascript: "js",
      python: "py"
    };
    
    setSelectedFile(`main.${extensions[language]}`);
  };

  // This effect runs when currentLanguage changes from any source
  useEffect(() => {
    if (socket && socket.connected) {
      console.log("Language changed to:", currentLanguage);
      
      // Update file extension
      updateFileExtension(currentLanguage);
      
      // Broadcast language change to other participants
      socket.emit("languageUpdate", {
        sessionId: activeSessionId,
        language: currentLanguage
      });
    }
  }, [currentLanguage]);

  // Simulated file structure
  const fileStructure = {
    name: "src",
    type: "folder",
    children: [
      {
        name: "components",
        type: "folder",
        children: [
          { name: "Header.jsx", type: "file" },
          { name: "Sidebar.jsx", type: "file" },
          { name: "Footer.jsx", type: "file" }
        ]
      },
      { name: `main.${currentLanguage === 'javascript' ? 'js' : 'py'}`, type: "file" },
      { name: "App.jsx", type: "file" },
      { name: "styles.css", type: "file" }
    ]
  };

  // Event handlers
  const toggleTerminal = () => {
    setIsTerminalOpen(!isTerminalOpen);
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    if (socket && socket.connected) {
      console.log("Sending code update for session:", activeSessionId);
      socket.emit("codeUpdate", { sessionId: activeSessionId, code: newCode });
    }
  };

  const toggleAudio = () => {
    const newAudioState = !isAudioOn;
    setIsAudioOn(newAudioState);
    
    // Update local participant state
    const userId = localStorage.getItem("userId");
    setActiveParticipants(prev => 
      prev.map(p => p.id.toString() === userId ? {...p, isMuted: !newAudioState} : p)
    );
    
    // Notify other participants via socket if connected
    if (socket && socket.connected) {
      socket.emit("audioToggled", {
        sessionId: activeSessionId,
        userId,
        isMuted: !newAudioState
      });
    }
  };

  const toggleVideo = () => {
    const newVideoState = !isVideoOn;
    setIsVideoOn(newVideoState);
    
    // Update local participant state
    const userId = localStorage.getItem("userId");
    setActiveParticipants(prev => 
      prev.map(p => p.id.toString() === userId ? {...p, isVideoOff: !newVideoState} : p)
    );
    
    // Notify other participants via socket if connected
    if (socket && socket.connected) {
      socket.emit("videoToggled", {
        sessionId: activeSessionId,
        userId,
        isVideoOff: !newVideoState
      });
    }
  };
  
  // External API code execution
  const executeCode = async () => {
    if (isExecuting) return;
    
    // Create a command entry for terminal history
    const commandEntry = { 
      type: 'input', 
      content: `run ${currentLanguage === 'javascript' ? 'main.js' : 'main.py'}` 
    };
    
    // Add loading message entry
    const loadingEntry = { 
      type: 'output', 
      content: 'Executing code...' 
    };
    
    // Update local terminal with command and loading message
    const updatedHistory = [...terminalOutput, commandEntry, loadingEntry];
    setTerminalOutput(updatedHistory);
    
    // Ensure terminal is open
    if (!isTerminalOpen) {
      setIsTerminalOpen(true);
    }
    
    // Set executing state
    setIsExecuting(true);
    
    try {
      // Map our language identifiers to the API's expected values
      const apiLanguage = {
        'javascript': 'javascript',
        'python': 'python3'
      }[currentLanguage];
      
      // Call the execution API
      const result = await executeCodeWithExternalAPI(code, apiLanguage);
      
      // Parse API response
      let output = '';
      let error = '';
      
      if (result.run) {
        output = result.run.stdout || '';
        error = result.run.stderr || '';
      } else {
        output = result.output || '';
        error = result.error || '';
      }
      
      // Create result entries
      const resultEntries = [];
      
      if (output) {
        resultEntries.push({ type: 'output', content: output });
      }
      
      if (error) {
        resultEntries.push({ type: 'error', content: error });
      }
      
      // Update local terminal by replacing the loading message with actual results
      const finalHistory = [
        ...updatedHistory.slice(0, -1), // Remove the loading message
        ...resultEntries
      ];
      
      setTerminalOutput(finalHistory);
      
      // Share command and results with other users via socket
      if (socket && socket.connected) {
        // Send the complete terminal entries
        socket.emit("executionResult", { 
          sessionId: activeSessionId, 
          terminalEntries: [commandEntry, ...resultEntries]
        });
      }
    } catch (error) {
      console.error("Code execution error:", error);
      const errorEntry = { 
        type: 'error', 
        content: `Error executing code: ${error.message}` 
      };
      
      // Update local terminal
      const finalHistory = [
        ...updatedHistory.slice(0, -1), // Remove the loading message
        errorEntry
      ];
      
      setTerminalOutput(finalHistory);
      
      // Share error with other users
      if (socket && socket.connected) {
        socket.emit("executionResult", {
          sessionId: activeSessionId,
          terminalEntries: [commandEntry, errorEntry]
        });
      }
    } finally {
      setIsExecuting(false);
    }
  };
  
  // Function to execute code using external API
  const PISTON_API_URL = 'https://emkc.org/api/v2/piston';

  const executeCodeWithExternalAPI = async (code, language) => {
    try {
      console.log(`Executing ${language} code with Piston API`);
      
      const response = await fetch(`${PISTON_API_URL}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: language,
          version: language === 'javascript' ? '18.x' : '3.10.0',
          files: [
            {
              content: code
            }
          ],
          stdin: '',
          args: [],
          compile_timeout: 10000,
          run_timeout: 10000
        })
      });
  
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
  
      const result = await response.json();
      console.log("API Response:", result);
  
      // Handle the Piston API response structure properly
      return {
        output: result.run?.stdout || '',
        error: result.run?.stderr || '',
        exitCode: result.run?.code || 0
      };
    } catch (error) {
      console.error("Code execution API error:", error);
      return {
        output: '',
        error: `Execution failed: ${error.message}`,
        exitCode: 1
      };
    }
  };
  
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-[#0f172a] to-[#0c0f1d] text-gray-100 overflow-hidden font-sans">
      {/* Ambient background effect */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxwYXR0ZXJuIGlkPSJncmlkIiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjxwYXRoIGQ9Ik0gMjAgMCBMIDAgMCAwIDIwIiBmaWxsPSJub25lIiBzdHJva2U9IiMyMDM1NWEiIHN0cm9rZS13aWR0aD0iMC41Ii8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIiAvPjwvc3ZnPg==')] opacity-20 z-0 pointer-events-none"></div>
      
      {/* Main layout container */}
      <div className="flex flex-1 overflow-hidden z-10 relative">
        {/* Sidebar / File Explorer */}
        <div 
          className={`h-full backdrop-blur-md bg-[#0a101f]/80 border-r border-indigo-900/40 transition-all duration-300 ease-in-out
            ${isSidebarOpen ? 'w-64' : 'w-0 opacity-0'}`}
        >
          {/* App Logo and Controls */}
          <div className="flex items-center justify-between p-3 border-b border-indigo-900/30 bg-gradient-to-r from-indigo-900/40 to-blue-900/30">
            <Link to="/" className="text-sm font-bold text-cyan-400 tracking-widest uppercase hover:text-cyan-300 transition-colors flex items-center space-x-2">
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 p-1 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">KodeSesh</span>
            </Link>
            <FileExplorer.Controls />
          </div>
          
          {/* File Tree */}
          <div className="overflow-y-auto h-full py-2 px-1">
            <FileExplorer 
              fileStructure={fileStructure} 
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
              currentLanguage={currentLanguage}  
            />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Header */}
          <div className="bg-gradient-to-r from-[#0f172a]/90 to-[#1e293b]/90 backdrop-blur-md border-b border-cyan-900/30 shadow-lg z-20">
          <EditorHeader 
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            isTerminalOpen={isTerminalOpen}
            toggleTerminal={toggleTerminal}
            selectedFile={selectedFile}
            isCallPanelOpen={isCallPanelOpen}
            setIsCallPanelOpen={setIsCallPanelOpen}
            participantsCount={activeParticipants.length}
            currentLanguage={currentLanguage}
            setCurrentLanguage={setCurrentLanguage}
            executeCode={executeCode}    
            isExecuting={isExecuting}
            socket={socket}
            activeSessionId={activeSessionId}
          />
          </div>

          {/* Main Content with Editor and Call Panel */}
          <div className="flex-1 flex overflow-hidden">
            {/* Editor and Terminal Container */}
            <div className={`flex flex-col transition-all duration-300 ${isCallPanelOpen ? 'w-8/12' : 'w-full'}`}>
              {/* Code Editor */}
              <div className={`flex-1 ${isTerminalOpen ? 'h-3/4' : 'h-full'} bg-[#0b111d]/90 backdrop-blur-md relative`}>
                {/* Line Numbers Decoration (Visual Only) */}
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-b from-blue-900/20 to-indigo-900/20 border-r border-indigo-900/30 z-0 hidden md:block">
                  <div className="h-full flex flex-col items-end pr-2 pt-1 text-cyan-500/50 text-xs">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div key={i} className="leading-6">{i + 1}</div>
                    ))}
                  </div>
                </div>
                
                {/* Editor Content */}
                <div className={`h-full ${isTerminalOpen ? 'border-b border-indigo-900/30' : ''}`}>
                  <CodeEditor 
                    code={code} 
                    onChange={handleCodeChange} 
                    language={currentLanguage}
                  />
                </div>
              </div>

              {/* Terminal Panel */}
              {isTerminalOpen && (
                <div className="border-t border-cyan-900/30 bg-[#0a1121]/90 backdrop-blur-md" style={{ height: `${terminalHeight}px` }}>
                  <TerminalPanel 
                    isOpen={isTerminalOpen}
                    onClose={toggleTerminal}
                    height={terminalHeight}
                    onHeightChange={setTerminalHeight}
                    terminalHistory={terminalOutput}
                    setTerminalHistory={setTerminalOutput}
                  />
                </div>
              )}
            </div>

            {/* Call Panel */}
            {isCallPanelOpen && (
              <div className="w-4/12 border-l border-indigo-900/40 bg-gradient-to-b from-[#0c1529]/90 to-[#0a101f]/90 backdrop-blur-md">
                <CallPanel 
                  participants={activeParticipants}
                  isAudioOn={isAudioOn}
                  isVideoOn={isVideoOn}
                  toggleAudio={toggleAudio}
                  toggleVideo={toggleVideo}
                  socket={socket}
                  activeSessionId={activeSessionId}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Status Bar */}
      <div className="h-6 bg-gradient-to-r from-cyan-600 to-blue-700 text-white text-xs flex items-center px-4 justify-between border-t border-cyan-500/50 shadow-[0_-5px_15px_rgba(6,182,212,0.2)] z-10">
        <div className="flex space-x-4">
          <div className="flex items-center">
            <div className="h-2 w-2 rounded-full bg-green-400 mr-2 shadow-[0_0_5px_#4ade80]"></div>
            <span>Session: {activeSessionId}</span>
          </div>
          <span>{selectedFile}</span>
          <span>Connected: {socket?.connected ? 'Yes' : 'No'}</span>
        </div>
        <div className="flex space-x-4">
          <span>Participants: {activeParticipants.length}</span>
          <span>UTF-8</span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-200 to-blue-200">
            {currentLanguage === 'javascript' ? 'JavaScript' : 'Python'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CodeEditorDashboard;