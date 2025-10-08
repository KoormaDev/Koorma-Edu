export default function TestPage() {
  return (
    <div style={{padding: '20px', fontFamily: 'Arial, sans-serif'}}>
      <h1>Test Page - No Authentication Required</h1>
      <p>If you can see this page, then the issue is not with the middleware or authentication system.</p>
      <p>This is a simple test page without any authentication checks.</p>
      <p>Date: {new Date().toISOString()}</p>
    </div>
  );
}