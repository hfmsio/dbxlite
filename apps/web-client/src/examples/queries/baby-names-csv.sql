SELECT *
FROM 'https://raw.githubusercontent.com/hadley/data-baby-names/master/baby-names.csv'
ORDER BY year DESC, percent DESC
LIMIT 1000;
