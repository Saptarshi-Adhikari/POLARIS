# Graph Report - .  (2026-08-29)

## Corpus Check
- 8 files · ~56,892 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 105 nodes · 146 edges · 11 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]

## God Nodes (most connected - your core abstractions)
1. `CanvasRenderer` - 33 edges
2. `Camera` - 14 edges
3. `SimulationEngine` - 13 edges
4. `UIController` - 11 edges
5. `VectorField` - 8 edges
6. `AINavigator` - 6 edges
7. `Iceberg` - 6 edges
8. `Ship` - 6 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.2
Nodes (1): Camera

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (1): SimulationEngine

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (1): CanvasRenderer

### Community 3 - "Community 3"
Cohesion: 0.17
Nodes (0): 

### Community 4 - "Community 4"
Cohesion: 0.27
Nodes (1): UIController

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (1): VectorField

### Community 6 - "Community 6"
Cohesion: 0.43
Nodes (1): AINavigator

### Community 7 - "Community 7"
Cohesion: 0.38
Nodes (1): Iceberg

### Community 8 - "Community 8"
Cohesion: 0.33
Nodes (1): Ship

### Community 9 - "Community 9"
Cohesion: 0.4
Nodes (0): 

### Community 10 - "Community 10"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 10`** (2 nodes): `.drawMarker()`, `.drawNavMarkers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CanvasRenderer` connect `Community 2` to `Community 9`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._