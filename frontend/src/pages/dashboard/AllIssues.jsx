import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout';
import { getAllIssuesFull } from '../../services/issues';

const AllIssues = () => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAllIssues = async () => {
      setLoading(true);
      const response = await getAllIssuesFull();
      if (response.success) {
        console.log('[AllIssues] fetched issues length:', response.data.length, 'sample first item:', response.data[0]);
        setIssues(response.data);
        setError(null);
      } else {
        console.warn('[AllIssues] fetch error:', response.error);
        setError(response.error || 'Failed to fetch issues.');
      }
      setLoading(false);
    };
    fetchAllIssues();
  }, []);

  return (
    <DashboardLayout>
      <div className="card">
        <div className="card-header">
          <h2>All Issues</h2>
        </div>
        <div className="card-body">
          {error && <div className="alert alert-danger">{error}</div>}
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Reporter</th>
                    <th>Location</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Category</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map(issue => (
                    <tr key={issue.id || issue._id}>
                      <td>{issue.title}</td>
                      <td>{issue.reporter?.name || issue.reporter}</td>
                      <td>{issue.location?.address || issue.location}</td>
                      <td>{issue.date || issue.createdAt}</td>
                      <td>{issue.status}</td>
                      <td>{issue.category}</td>
                      <td>{issue.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AllIssues;
