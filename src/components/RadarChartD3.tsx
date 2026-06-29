import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface RadarChartD3Props {
  data: { axis: string; value: number }[];
  width?: number;
  height?: number;
}

export const RadarChartD3: React.FC<RadarChartD3Props> = ({ data, width = 300, height = 300 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    const radius = Math.min(width - margin.left - margin.right, height - margin.top - margin.bottom) / 2;
    const centerX = width / 2;
    const centerY = height / 2;

    const angleSlice = (Math.PI * 2) / data.length;

    // Scale for the radius
    const rScale = d3.scaleLinear()
      .range([0, radius])
      .domain([0, 100]);

    const g = svg.append('g')
      .attr('transform', `translate(${centerX},${centerY})`);

    // Draw grid circles
    const levels = 5;
    const axisGrid = g.append('g').attr('class', 'axisWrapper');
    
    for (let i = 1; i <= levels; i++) {
      const levelFactor = radius * (i / levels);
      axisGrid.append('circle')
        .attr('r', levelFactor)
        .style('fill', '#cdcdcd')
        .style('stroke', '#cdcdcd')
        .style('fill-opacity', 0.1)
        .style('stroke-opacity', 0.5)
        .style('stroke-dasharray', '3,3');
    }

    // Draw axes
    const axis = axisGrid.selectAll('.axis')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'axis');

    axis.append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', (d, i) => rScale(100) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr('y2', (d, i) => rScale(100) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr('class', 'line')
      .style('stroke', '#cdcdcd')
      .style('stroke-width', '1px');

    axis.append('text')
      .attr('class', 'legend')
      .style('font-size', '11px')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('x', (d, i) => rScale(100 * 1.2) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr('y', (d, i) => rScale(100 * 1.2) * Math.sin(angleSlice * i - Math.PI / 2))
      .text(d => d.axis)
      .style('fill', 'currentColor');

    // Draw the radar area
    const radarLine = d3.lineRadial<{ axis: string; value: number }>()
      .angle((d, i) => i * angleSlice)
      .radius(d => rScale(d.value))
      .curve(d3.curveLinearClosed);

    const radarArea = g.append('g')
      .selectAll('.radarArea')
      .data([data])
      .enter()
      .append('path')
      .attr('class', 'radarArea')
      .attr('d', d => radarLine(d))
      .style('fill', '#10b981')
      .style('fill-opacity', 0.3)
      .style('stroke', '#10b981')
      .style('stroke-width', 2);

    // Draw the data points
    g.selectAll('.radarCircle')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'radarCircle')
      .attr('r', 4)
      .attr('cx', (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr('cy', (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2))
      .style('fill', '#10b981')
      .style('fill-opacity', 0.8)
      .style('stroke', '#fff')
      .style('stroke-width', 1.5);

  }, [data, width, height]);

  return (
    <svg 
      ref={svgRef} 
      width={width} 
      height={height} 
      className="text-slate-700 dark:text-slate-300 transition-colors"
      style={{ display: 'block', margin: '0 auto' }}
    />
  );
};
