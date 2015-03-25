MatPro - Matrix Projections
A web tool to visualize multi-dimensional structured data by intuitive projections

=== overview ===
1. A 2-D table shows the current projection, with column headers and row names
2. A 2-D graph illustrates the 2-D table; No -- another one also show it, yet with axis flipped
3. The other dimensions are listed with a set value aside from the table, with a default dimension hightlighted, call it the "implicit" dimension
4. When one or more cells are selected, a 2-D graph illustrades such cell value(s) against the implicit dimension
5. When a column is selected, a 2-D graph illustrates the rows and the implicit dimension as new columns, with the original column-dimention set as the selected value
6. Depending on the values to be illustrated, the 2-D graph may use normal axis values or logrithm ones
7. When multiple columns are selected, the 2-D graph would be a multi-line graph
8. When one column is selected, we can "twist" the table, so that the row-dimension stay the same, yet the column-dimentions swaps with the implicit dimension
9. We may twist the table with a selected row, too
a. The 2-D graphs may also be animated on some chosen dimension, which may or may not be the implicit dimension
b. Conformant rules of some matrix points may be defined, so that a warning is issued for violations of such rules
c. Multiple 2-D graphs/animations may be shown at the same time
d. Table twists are saved in a history tree, with every state re-traceable, not just undo/redo, but "replay with multiple storylines"

=== installation ===
1. update your node
sudo npm cache clean -f
sudo npm install -g n
sudo n stable

2. this app
npm install

3. run with run/www and visit localhost:3000
