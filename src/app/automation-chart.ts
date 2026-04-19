import { Component, effect, input, viewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import * as d3 from 'd3';

interface ChartDataItem {
  name: string;
  entered: number;
  completed: number;
  emailsSent: number;
}

@Component({
  selector: 'app-automation-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full h-64 relative bg-white rounded-2xl p-4 border border-slate-200" #container>
      <svg #svg class="w-full h-full overflow-visible"></svg>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
  `]
})
export class AutomationChart {
  data = input<ChartDataItem[]>([]);
  svgRef = viewChild<ElementRef<SVGSVGElement>>('svg');
  containerRef = viewChild<ElementRef<HTMLDivElement>>('container');

  constructor() {
    effect(() => {
      const data = this.data();
      const svgEl = this.svgRef()?.nativeElement;
      const containerEl = this.containerRef()?.nativeElement;

      if (!svgEl || !containerEl || !data || data.length === 0) return;

      this.render(svgEl, containerEl, data);
    });
  }

  private render(svgEl: SVGSVGElement, containerEl: HTMLDivElement, data: ChartDataItem[]) {
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };
    const width = containerEl.clientWidth - margin.left - margin.right;
    const height = containerEl.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(data.map(d => d.name))
      .range([0, width])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => Math.max(d.entered, d.completed)) || 10])
      .nice()
      .range([height, 0]);

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)')
      .style('font-size', '10px')
      .style('fill', '#64748b');

    // Y Axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .style('fill', '#64748b');

    // Entered Bars
    g.selectAll('.bar-entered')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar-entered')
      .attr('x', d => (x(d.name) || 0))
      .attr('y', d => y(d.entered))
      .attr('width', x.bandwidth() / 2)
      .attr('height', d => height - y(d.entered))
      .attr('fill', '#6366f1')
      .attr('rx', 4);

    // Completed Bars
    g.selectAll('.bar-completed')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar-completed')
      .attr('x', d => (x(d.name) || 0) + x.bandwidth() / 2)
      .attr('y', d => y(d.completed))
      .attr('width', x.bandwidth() / 2)
      .attr('height', d => height - y(d.completed))
      .attr('fill', '#10b981')
      .attr('rx', 4);
    
    // Add Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 100}, 0)`);
    
    legend.append('rect').attr('width', 10).attr('height', 10).attr('fill', '#6366f1').attr('rx', 2);
    legend.append('text').attr('x', 15).attr('y', 10).text('Entradas').style('font-size', '10px').attr('fill', '#475569');
    
    legend.append('rect').attr('x', 0).attr('y', 15).attr('width', 10).attr('height', 10).attr('fill', '#10b981').attr('rx', 2);
    legend.append('text').attr('x', 15).attr('y', 25).text('Concluídas').style('font-size', '10px').attr('fill', '#475569');
  }
}
