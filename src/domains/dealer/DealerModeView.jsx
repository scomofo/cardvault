import { useState } from 'react'
import { useBatchListing } from '../../pipelines/batchPipeline/useBatchListing'

export default function DealerModeView({ cards }) {
  const { processBatch } = useBatchListing()

  const [listings, setListings] = useState([])
  const [progress, setProgress] = useState(0)
  const [running, setRunning] = useState(false)

  const runDealerMode = async () => {
    setRunning(true)

    const results = await processBatch(cards, ({ current, total }) => {
      setProgress(current / total)
    })

    setListings(results)
    setRunning(false)
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Dealer Mode</h1>

      <button onClick={runDealerMode} disabled={running}>
        {running ? 'Processing...' : 'Run Auto Listing'}
      </button>

      {running && (
        <div style={{ marginTop: 12 }}>
          Progress: {(progress * 100).toFixed(0)}%
        </div>
      )}

      {listings.length > 0 && (
        <table style={{ marginTop: 24, width: '100%' }}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Price</th>
              <th>Strategy</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l, i) => (
              <tr key={i}>
                <td>{l.title}</td>
                <td>{l.price}</td>
                <td>{l.strategy}</td>
                <td>{(l.confidence * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
