export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-6">Ghost ATProto Integration</h1>
      <p className="text-lg mb-4">
        Welcome to your Ghost-ATProto NextJS application!
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="border rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-3">Features</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Ghost CMS Integration</li>
            <li>ATProto/Bluesky Publishing</li>
            <li>Automatic Content Sync</li>
            <li>User Management</li>
            <li>Real-time Dashboard</li>
          </ul>
        </div>
        
        <div className="border rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-3">Status</h2>
          <div className="space-y-2">
            <div className="flex items-center">
              <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
              Database Connected
            </div>
            <div className="flex items-center">
              <span className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></span>
              Setup In Progress
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
