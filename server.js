const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

function buildUserId() {
  const fullName = (process.env.FULL_NAME || "").trim().toLowerCase().replace(/\s+/g, "");
  const dob = (process.env.DOB_DDMMYYYY || "").trim();

  return `${fullName}_${dob}`;
}

function isValidNodeEntry(entry) {
  return /^[A-Z]->[A-Z]$/.test(entry) && entry[0] !== entry[3];
}

function getConnectedComponents(nodes, undirectedAdj) {
  const visited = new Set();
  const components = [];

  for (const node of nodes) {
    if (visited.has(node)) {
      continue;
    }

    const queue = [node];
    visited.add(node);
    const component = [];

    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);

      for (const neighbor of undirectedAdj.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    components.push(component.sort());
  }

  return components;
}

function detectCycleInComponent(component, directedAdj) {
  const componentSet = new Set(component);
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node) {
    visited.add(node);
    recursionStack.add(node);

    const children = directedAdj.get(node) || [];
    for (const child of children) {
      if (!componentSet.has(child)) {
        continue;
      }

      if (!visited.has(child)) {
        if (dfs(child)) {
          return true;
        }
      } else if (recursionStack.has(child)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const node of component) {
    if (!visited.has(node) && dfs(node)) {
      return true;
    }
  }

  return false;
}

function buildNestedTree(root, directedAdj, componentSet) {
  function dfs(node) {
    const result = {};
    const children = (directedAdj.get(node) || []).filter((child) => componentSet.has(child)).sort();

    for (const child of children) {
      result[child] = dfs(child);
    }

    return result;
  }

  return {
    [root]: dfs(root)
  };
}

function calculateDepth(root, directedAdj, componentSet) {
  const memo = new Map();

  function dfs(node) {
    if (memo.has(node)) {
      return memo.get(node);
    }

    const children = (directedAdj.get(node) || []).filter((child) => componentSet.has(child));
    if (children.length === 0) {
      memo.set(node, 1);
      return 1;
    }

    let maxDepth = 0;
    for (const child of children) {
      maxDepth = Math.max(maxDepth, dfs(child));
    }

    const depth = 1 + maxDepth;
    memo.set(node, depth);
    return depth;
  }

  return dfs(root);
}

function processHierarchy(data) {
  const invalidEntries = [];
  const duplicateEdges = [];
  const seenEdges = new Set();
  const duplicateRecorded = new Set();
  const validEdges = [];

  for (const rawEntry of data) {
    if (typeof rawEntry !== "string") {
      invalidEntries.push("");
      continue;
    }

    const trimmed = rawEntry.trim();

    if (!isValidNodeEntry(trimmed)) {
      invalidEntries.push(trimmed);
      continue;
    }

    if (seenEdges.has(trimmed)) {
      if (!duplicateRecorded.has(trimmed)) {
        duplicateEdges.push(trimmed);
        duplicateRecorded.add(trimmed);
      }
      continue;
    }

    seenEdges.add(trimmed);
    validEdges.push(trimmed);
  }

  const nodes = new Set();
  const directedAdj = new Map();
  const undirectedAdj = new Map();
  const childToParent = new Map();

  function ensureNode(node) {
    if (!directedAdj.has(node)) {
      directedAdj.set(node, []);
    }

    if (!undirectedAdj.has(node)) {
      undirectedAdj.set(node, new Set());
    }
  }

  for (const edge of validEdges) {
    const [parent, child] = edge.split("->");
    ensureNode(parent);
    ensureNode(child);

    nodes.add(parent);
    nodes.add(child);

    undirectedAdj.get(parent).add(child);
    undirectedAdj.get(child).add(parent);

    if (!childToParent.has(child)) {
      childToParent.set(child, parent);
      directedAdj.get(parent).push(child);
    }
  }

  const allNodes = Array.from(nodes).sort();
  const components = getConnectedComponents(allNodes, undirectedAdj);
  const hierarchies = [];
  let totalTrees = 0;
  let totalCycles = 0;
  let largestTreeRoot = "";
  let largestDepth = -1;

  for (const component of components) {
    const componentSet = new Set(component);
    const roots = component.filter((node) => !childToParent.has(node)).sort();
    const root = roots.length > 0 ? roots[0] : [...component].sort()[0];
    const hasCycle = detectCycleInComponent(component, directedAdj);

    if (hasCycle) {
      totalCycles += 1;
      hierarchies.push({
        root,
        tree: {},
        has_cycle: true
      });
      continue;
    }

    const tree = buildNestedTree(root, directedAdj, componentSet);
    const depth = calculateDepth(root, directedAdj, componentSet);

    totalTrees += 1;

    if (depth > largestDepth || (depth === largestDepth && (largestTreeRoot === "" || root < largestTreeRoot))) {
      largestDepth = depth;
      largestTreeRoot = root;
    }

    hierarchies.push({
      root,
      tree,
      depth
    });
  }

  return {
    user_id: buildUserId(),
    email_id: process.env.EMAIL_ID || "",
    college_roll_number: process.env.COLLEGE_ROLL_NUMBER || "",
    hierarchies,
    invalid_entries: invalidEntries,
    duplicate_edges: duplicateEdges,
    summary: {
      total_trees: totalTrees,
      total_cycles: totalCycles,
      largest_tree_root: largestTreeRoot
    }
  };
}

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/bfhl", (req, res) => {
  try {
    const { data } = req.body;

    if (!Array.isArray(data)) {
      return res.status(400).json({
        error: "Invalid request. 'data' must be an array of strings."
      });
    }

    return res.status(200).json(processHierarchy(data));
  } catch (error) {
    console.error("Error processing /bfhl:", error);
    return res.status(500).json({
      error: "Internal server error"
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});