import { fontSize as fs, useColors } from "@/styles/theme";
import type { MindmapPart } from "@readany/core/types/message";
import { useCallback, useMemo } from "react";
import { Dimensions, ScrollView, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

interface MindmapPartViewProps {
  part: MindmapPart;
}

interface MindmapNode {
  id: string;
  text: string;
  level: number;
  children: MindmapNode[];
  x: number;
  y: number;
  width: number;
  height: number;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const NODE_PADDING = 12;
const NODE_HEIGHT = 36;
const LEVEL_GAP = 120;
const NODE_GAP = 8;

export function MindmapPartView({ part }: MindmapPartViewProps) {
  const colors = useColors();

  const parseMarkdownToTree = useCallback(
    (markdown: string): MindmapNode => {
      const lines = markdown.split("\n").filter((line) => line.trim());
      const root: MindmapNode = {
        id: "root",
        text: part.title || "Mindmap",
        level: 0,
        children: [],
        x: 0,
        y: 0,
        width: 0,
        height: NODE_HEIGHT,
      };

      const stack: MindmapNode[] = [root];
      let nodeCounter = 0;

      lines.forEach((line) => {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        const bulletMatch = line.match(/^(\s*)-\s+(.+)/);

        let level: number;
        let text: string;

        if (headingMatch) {
          level = headingMatch[1].length;
          text = headingMatch[2].trim();
        } else if (bulletMatch) {
          const indent = bulletMatch[1].length;
          level = Math.floor(indent / 2) + 7;
          text = bulletMatch[2].trim();
        } else {
          return;
        }

        const node: MindmapNode = {
          id: `node-${nodeCounter++}`,
          text,
          level,
          children: [],
          x: 0,
          y: 0,
          width: 0,
          height: NODE_HEIGHT,
        };

        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        stack[stack.length - 1].children.push(node);
        stack.push(node);
      });

      return root;
    },
    [part.title],
  );

  const calculateLayout = useCallback((node: MindmapNode, startY = 0): number => {
    if (node.children.length === 0) {
      node.y = startY;
      return startY + NODE_HEIGHT + NODE_GAP;
    }

    let currentY = startY;
    node.children.forEach((child) => {
      currentY = calculateLayout(child, currentY);
    });

    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    node.y = (firstChild.y + lastChild.y) / 2;

    return currentY;
  }, []);

  const assignPositions = useCallback((node: MindmapNode, depth = 0) => {
    node.x = depth * LEVEL_GAP + NODE_PADDING;
    node.children.forEach((child) => {
      assignPositions(child, depth + 1);
    });
  }, []);

  const { root, svgWidth, svgHeight } = useMemo(() => {
    const root = parseMarkdownToTree(part.markdown);
    calculateLayout(root, 50);
    assignPositions(root, 0);

    let maxY = 0;
    let maxX = 0;

    const traverse = (node: MindmapNode) => {
      maxY = Math.max(maxY, node.y + NODE_HEIGHT + 50);
      maxX = Math.max(maxX, node.x + 300);
      node.children.forEach(traverse);
    };
    traverse(root);

    return {
      root,
      svgWidth: Math.max(maxX, SCREEN_WIDTH - 40),
      svgHeight: maxY,
    };
  }, [part.markdown, parseMarkdownToTree, calculateLayout, assignPositions]);

  const renderNode = useCallback(
    (node: MindmapNode, depth: number): React.ReactNode[] => {
      const elements: React.ReactNode[] = [];
      const isRoot = depth === 0;
      const nodeWidth = Math.min(200, node.text.length * 14 + NODE_PADDING * 2);

      elements.push(
        <G key={node.id}>
          <Rect
            x={node.x}
            y={node.y}
            width={nodeWidth}
            height={NODE_HEIGHT}
            rx={isRoot ? 18 : 8}
            fill={isRoot ? colors.primary : depth === 1 ? colors.muted : colors.card}
            stroke={isRoot ? colors.primary : colors.border}
            strokeWidth={isRoot ? 2 : 1}
          />
          <SvgText
            x={node.x + nodeWidth / 2}
            y={node.y + NODE_HEIGHT / 2 + 5}
            textAnchor="middle"
            fontSize={isRoot ? 16 : 14}
            fontWeight={isRoot ? "600" : "400"}
            fill={isRoot ? colors.primaryForeground : colors.foreground}
          >
            {node.text.length > 15 ? node.text.slice(0, 15) + "..." : node.text}
          </SvgText>
        </G>,
      );

      node.children.forEach((child) => {
        elements.push(
          <Line
            key={`line-${node.id}-${child.id}`}
            x1={node.x + nodeWidth}
            y1={node.y + NODE_HEIGHT / 2}
            x2={child.x}
            y2={child.y + NODE_HEIGHT / 2}
            stroke={colors.border}
            strokeWidth={1.5}
          />,
        );
        elements.push(...renderNode(child, depth + 1));
      });

      return elements;
    },
    [colors],
  );

  return (
    <View
      style={{
        marginVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.muted,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: fs.sm,
            fontWeight: "600",
            color: colors.foreground,
          }}
        >
          🧠 {part.title}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ padding: 16 }}
      >
        <ScrollView
          style={{ maxHeight: 400 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          <Svg width={svgWidth} height={svgHeight}>
            {renderNode(root, 0)}
          </Svg>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
