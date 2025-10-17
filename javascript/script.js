var number = 10;
var string = 'Hello THERE';
var isRad = true;
var groceries = ['milk', 'eggs', 'cheese'];

/* if(number === 10) {
    console.log('yes');
} else {
    console.log('nope');
}
document.getElementById('box').innerHTML = number + 5; */

function listGroceries() {
    for(var i=0; i < groceries.length; i++) {
        console.log(groceries[i]);
    };
}

document.getElementById('box').addEventListener('click', function(){
    alert('I got clicked');
})

