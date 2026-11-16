
import React, { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Database,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle,
  RefreshCw,
  Info,
  Eye,
} from "lucide-react";
import "./index.css";

const API_URL = "https://medmorph.onrender.com/classify";

const CATEGORIES = {
  SENSITIVE: "Sensitive",
  NON_SENSITIVE: "Non-sensitive",
  REVIEW: "Needs Review",
};

// Map ML categories to the categories used by the Data Morphing page.
const mapCategory = (category) => {
  const value = String(category || "").toLowerCase().trim();

  if (
    value === "non-sensitive attribute" ||
    value === "non-sensitive"
  ) {
    return CATEGORIES.NON_SENSITIVE;
  }

  if (value === "needs review") {
    return CATEGORIES.REVIEW;
  }

  if (
    [
      "direct identifier",
      "linking key",
      "quasi-identifier",
      "sensitive clinical attribute",
    ].includes(value)
  ) {
    return CATEGORIES.SENSITIVE;
  }

  return CATEGORIES.REVIEW;
};

// Assign a privacy action to each ML category.
const getPrivacyAction = (category) => {
  const value = String(category || "").toLowerCase().trim();

  switch (value) {
    case "direct identifier":
      return "Mask";

    case "linking key":
      return "Tokenize";

    case "quasi-identifier":
      return "Generalize";

    case "sensitive clinical attribute":
      return "Protect / Transform";

    case "non-sensitive attribute":
    case "non-sensitive":
      return "Retain";

    case "needs review":
      return "Manual Review";

    default:
      return "Manual Review";
  }
};

// Determine badge styling for privacy actions.
const getActionClass = (action) => {
  switch (action) {
    case "Mask":
      return "high";

    case "Tokenize":
      return "medium";

    case "Generalize":
      return "medium";

    case "Protect / Transform":
      return "high";

    case "Retain":
      return "low";

    default:
      return "medium";
  }
};

// Detect the data type of a column.
const detectDataType = (values) => {
  const validValues = values
    .filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    )
    .map((value) => String(value).trim());

  if (!validValues.length) return "Empty";

  if (validValues.every((value) => !isNaN(Number(value)))) {
    return "Numeric";
  }

  if (
    validValues.every((value) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
  ) {
    return "Email";
  }

  if (
    validValues.every((value) =>
      /^\+?[\d\s()-]{8,18}$/.test(value)
    )
  ) {
    return "Phone";
  }

  return "Text";
};

// Mask sample values before displaying them.
const maskValue = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Empty";
  }

  const text = String(value);

  if (text.length <= 2) return "*".repeat(text.length);

  return (
    text.substring(0, 1) +
    "*".repeat(Math.min(text.length - 1, 7))
  );
};

export default function Classification({
  dataset,
  onClassificationChange,
}) {
  const [classification, setClassification] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Send the uploaded file to the Python ML backend.
  useEffect(() => {
    let cancelled = false;

    const classifyFile = async () => {
      if (!dataset?.file) {
        setClassification([]);
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setClassification([]);

      try {
        const formData = new FormData();
        formData.append("file", dataset.file);

        const response = await fetch(API_URL, {
          method: "POST",
          body: formData,
        });

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(
            responseData.detail || "Classification failed."
          );
        }

        const results = responseData.results;

        if (!Array.isArray(results)) {
          throw new Error(
            "Unexpected response received from the Python backend."
          );
        }

        const formattedResults = results.map((item) => {
          const columnName =
            item.column || item.column_name || "";

          const rawCategory =
            item.category ||
            item.predicted_category ||
            item.prediction ||
            "Needs Review";

          const columnValues = dataset.rows.map(
            (row) => row[columnName]
          );

          const validValues = columnValues.filter(
            (value) =>
              value !== null &&
              value !== undefined &&
              String(value).trim() !== ""
          );

          const uniqueCount = new Set(
            validValues.map((value) => String(value).trim())
          ).size;

          const uniqueness = validValues.length
            ? Number(
                (
                  (uniqueCount / validValues.length) *
                  100
                ).toFixed(1)
              )
            : 0;

          const missingPercentage = columnValues.length
            ? Number(
                (
                  ((columnValues.length - validValues.length) /
                    columnValues.length) *
                  100
                ).toFixed(1)
              )
            : 0;

          const internalCategory = mapCategory(rawCategory);

          return {
            column: columnName,

            // Retain this for existing Data Morphing logic.
            category: internalCategory,

            // Actual ML classification.
            subtype: rawCategory,
            mlCategory: rawCategory,

            // Privacy action shown in the dashboard.
            privacyAction: getPrivacyAction(rawCategory),

            evidence:
              item.evidence ||
              "Classification predicted by the Python ML model.",

            dataType:
              item.dataType ||
              item.data_type ||
              detectDataType(columnValues),

            sample: maskValue(columnValues[0]),
            uniqueness,
            missingPercentage,
            totalValues: columnValues.length,
          };
        });

        if (!cancelled) {
          setClassification(formattedResults);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message ||
              "Unable to connect to the Python classification backend."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    classifyFile();

    return () => {
      cancelled = true;
    };
  }, [dataset?.file, dataset?.fileName]);

  // Share results with App.jsx.
  useEffect(() => {
    if (onClassificationChange) {
      onClassificationChange(classification);
    }
  }, [classification, onClassificationChange]);

  const totalColumns = classification.length;

  const sensitiveCount = classification.filter(
    (item) => item.category === CATEGORIES.SENSITIVE
  ).length;

  const nonSensitiveCount = classification.filter(
    (item) => item.category === CATEGORIES.NON_SENSITIVE
  ).length;

  const reviewCount = classification.filter(
    (item) => item.category === CATEGORIES.REVIEW
  ).length;

  // Search and filter classification results.
  const filteredResults = useMemo(() => {
    return classification.filter((item) => {
      const matchesSearch =
        item.column.toLowerCase().includes(search.toLowerCase()) ||
        item.mlCategory.toLowerCase().includes(search.toLowerCase()) ||
        item.privacyAction.toLowerCase().includes(search.toLowerCase());

      const matchesFilter =
        selectedFilter === "All" ||
        item.category === selectedFilter;

      return matchesSearch && matchesFilter;
    });
  }, [classification, search, selectedFilter]);

  // Display this when no dataset is uploaded.
  if (!dataset || !dataset.headers || dataset.headers.length === 0) {
    return (
      <div className="page-container">
        <div className="page-heading">
          <div>
            <h1>Data Classification</h1>
            <p>
              Automatically identify sensitive information in your dataset.
            </p>
          </div>
        </div>

        <div className="empty-state">
          <FileSpreadsheet size={48} />
          <h3>No dataset available</h3>
          <p>Upload a CSV or Excel dataset first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>Data Classification</h1>
          <p>
            Automatic identification powered by the Python Machine Learning model.
          </p>
        </div>

        <div className="classification-status">
          <ShieldCheck size={18} />
          <span>ML Analysis</span>
        </div>
      </div>

      {/* Uploaded dataset information */}
      <div className="panel classification-file-info">
        <div className="file-info-icon">
          <FileSpreadsheet size={25} />
        </div>

        <div>
          <h3>{dataset.fileName || "Uploaded Dataset"}</h3>
          <p>
            {dataset.rows.length} records · {dataset.headers.length} columns
          </p>
        </div>

        {!loading && !error && classification.length > 0 && (
          <div className="classification-complete">
            <CheckCircle size={17} />
            ML analysis completed
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="panel empty-state">
          <RefreshCw size={35} className="spin" />
          <h3>Analysing your dataset...</h3>
          <p>
            Sending your file to the Python ML classification engine.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="classification-note">
          <AlertTriangle size={19} />
          <div>
            <strong>Classification failed</strong>
            <p>{error}</p>
            <p>
              Check your internet connection and ensure the Python
              backend is available at {API_URL}.
            </p>
          </div>
        </div>
      )}

      {!loading && !error && classification.length > 0 && (
        <>
          {/* Classification statistics */}
          <div className="stats-grid classification-stats">
            <div className="stat-card">
              <div className="stat-icon blue">
                <Database size={22} />
              </div>
              <div>
                <p>Total Columns</p>
                <h2>{totalColumns}</h2>
                <span>Columns analysed</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon red">
                <ShieldAlert size={22} />
              </div>
              <div>
                <p>Privacy-relevant Columns</p>
                <h2>{sensitiveCount}</h2>
                <span>Fields requiring privacy treatment</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <ShieldCheck size={22} />
              </div>
              <div>
                <p>Non-sensitive</p>
                <h2>{nonSensitiveCount}</h2>
                <span>Fields classified for retention</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon orange">
                <AlertTriangle size={22} />
              </div>
              <div>
                <p>Needs Review</p>
                <h2>{reviewCount}</h2>
                <span>Uncertain classification</span>
              </div>
            </div>
          </div>

          {/* Classification results table */}
          <div className="panel classification-results">
            <div className="panel-header">
              <div>
                <h2>Automatic Classification Results</h2>
                <p>
                  ML categories are mapped to appropriate privacy actions.
                </p>
              </div>

              <div className="classification-engine-label">
                <RefreshCw size={15} />
                Python ML Model
              </div>
            </div>

            {/* Search and filter */}
            <div className="classification-controls">
              <div className="search-box">
                <Search size={17} />
                <input
                  type="text"
                  placeholder="Search columns or privacy actions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
              >
                <option value="All">All Results</option>
                <option value={CATEGORIES.SENSITIVE}>
                  Privacy-relevant
                </option>
                <option value={CATEGORIES.NON_SENSITIVE}>
                  Non-sensitive
                </option>
                <option value={CATEGORIES.REVIEW}>
                  Needs Review
                </option>
              </select>
            </div>

            {/* Results table */}
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Column Name</th>
                    <th>Data Type</th>
                    <th>Sample Value</th>
                    <th>Privacy Action</th>
                    <th>ML Category</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredResults.map((item, index) => (
                    <tr key={`${item.column}-${index}`}>
                      <td>
                        <strong>{item.column}</strong>
                      </td>

                      <td>{item.dataType}</td>

                      <td>
                        <span className="masked-value">
                          <Eye size={13} />
                          {item.sample}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`risk-badge ${getActionClass(
                            item.privacyAction
                          )}`}
                        >
                          {item.privacyAction}
                        </span>
                      </td>

                      <td>{item.mlCategory}</td>
                    </tr>
                  ))}

                  {filteredResults.length === 0 && (
                    <tr>
                      <td colSpan="5" className="no-results">
                        No matching columns found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ML explanation */}
            <div className="classification-evidence">
              <div className="evidence-heading">
                <Info size={18} />
                <h3>How the ML model classifies data</h3>
              </div>

              <div className="evidence-grid">
                <div className="evidence-item">
                  <ShieldAlert size={18} />
                  <div>
                    <strong>Column-name analysis</strong>
                    <p>
                      Analyses column names to identify possible personal
                      and medical information.
                    </p>
                  </div>
                </div>

                <div className="evidence-item">
                  <Search size={18} />
                  <div>
                    <strong>Pattern recognition</strong>
                    <p>
                      Uses word and character patterns learned during model
                      training.
                    </p>
                  </div>
                </div>

                <div className="evidence-item">
                  <Database size={18} />
                  <div>
                    <strong>Machine Learning prediction</strong>
                    <p>
                      Uses the trained classification model to predict
                      the category of each column.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Classification notice */}
          <div className="classification-note">
            <AlertTriangle size={19} />
            <div>
              <strong>Classification notice</strong>
              <p>
                These results are generated by the trained Python ML model.
                Unknown or uncertain categories should be reviewed by a user.
                Classification alone does not guarantee medical-data
                de-identification.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
