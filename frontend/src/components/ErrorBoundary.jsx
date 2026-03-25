import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-red-50 border-2 border-dashed border-red-200 rounded-3xl text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-3xl mb-4">⚠️</div>
          <h2 className="text-xl font-black text-gray-900 mb-2">Something went wrong in this section</h2>
          <p className="text-sm text-gray-600 mb-6 max-w-md">
            The {this.props.name || 'component'} encountered a runtime error. This might be due to missing data or a temporary connection issue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-200"
          >
            Reload Page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-6 p-4 bg-gray-900 text-red-400 text-[10px] text-left overflow-auto max-w-full rounded-lg font-mono">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
