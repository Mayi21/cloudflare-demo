import React, { useState } from 'react';

function App() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const handleEncode = () => {
    try {
      setOutput(btoa(input));
      setError('');
    } catch (e) {
      setError('Invalid input for encoding.');
      setOutput('');
    }
  };

  const handleDecode = () => {
    try {
      setOutput(atob(input));
      setError('');
    } catch (e) {
      setError('Invalid Base64 string for decoding.');
      setOutput('');
    }
  };

  return (
    <div className="container mt-5">
      <h1 className="mb-4">Base64 Encoder/Decoder</h1>
      <div className="form-group">
        <textarea
          className="form-control"
          rows="5"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text to encode or decode"
        ></textarea>
      </div>
      <button className="btn btn-primary mr-2" onClick={handleEncode}>
        Encode
      </button>
      <button className="btn btn-secondary" onClick={handleDecode}>
        Decode
      </button>
      {output && (
        <div className="mt-4">
          <h3>Result:</h3>
          <pre className="alert alert-success">{output}</pre>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <div className="alert alert-danger">{error}</div>
        </div>
      )}
    </div>
  );
}

export default App;