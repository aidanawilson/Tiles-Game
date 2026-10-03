import type { HexTile } from "../../shared/types";

export interface Point { x: number; y: number }

// Flat-top axial grid. The slight vertical compression is visual only and gives
// the mostly-bird's-eye / slightly-south camera angle chosen for Tiles.
export function hexToPixel(tile: HexTile, size: number): Point {
  return {
    x: size * 1.5 * tile.q,
    y: size * Math.sqrt(3) * (tile.r + tile.q / 2) * 0.82,
  };
}

export function hexCorners(center: Point, size: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    points.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle) * 0.82,
    });
  }
  return points;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
